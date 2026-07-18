import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import Groq from 'groq-sdk';
import { createHash } from 'crypto';
import {
  AiLog,
  University,
  UniversityMatchCache,
  VocationalTest,
  RecommendedCareerInput,
  UniversityCandidate,
  UniversityMatch,
  UniversityMatchRequest,
  UniversityMatchResponse,
} from '@app/common';
import {
  applyFiltersAndSort,
  computeBaseScore,
  findCareerMatch,
  haversineKm,
  validateAiMatches,
  MAX_DISTANCE_KM,
  ValidatedAiAdjustment,
} from './university-match.engine';
import {
  DISCARDED_INSTITUTION_TYPES,
  isExcludedInstitutionName,
} from './institution-filter';
import { recommendationPrograms } from './program-verification';

/**
 * A8 — Matching de universidades en 2 capas (arquitectura obligatoria):
 *
 *   CAPA 1 (determinista): match duro por programa en BD, distancia,
 *   costo y baseScore. Corre siempre, sin IA.
 *
 *   CAPA 2 (IA): lotes acotados con la lista candidata; la IA ajusta
 *   el baseScore (±15 máx) y redacta la explicación. Salida validada:
 *   universidades fuera de la lista se descartan. El radio define la lista
 *   y su caché; el filtro de costo se aplica después sin recalcular la IA.
 */
/** Nombre de proveedor con el que se cachea la degradación cuando la IA falla. */
const DETERMINISTIC_FALLBACK_PROVIDER = 'deterministic-fallback';
const PARTIAL_AI_PROVIDER = 'Groq-partial';
/** Invalida resultados previos cuando cambia el contexto incluido en el prompt. */
const A8_CACHE_VERSION = 'a8-v3-progressive-profile';

/** Cuánto dura el caché de un fallo de IA antes de reintentar (evita martillar un proveedor caído en cada click de filtro). */
const FALLBACK_CACHE_TTL_MS = 3 * 60 * 1000;
const PARTIAL_CACHE_TTL_MS = 60 * 1000;

/** Máximo tiempo de espera por intento de proveedor antes de darlo por caído. */
const PROVIDER_TIMEOUT_MS = 12_000;
const DISTANCE_MATRIX_TIMEOUT_MS = 4_000;
const DISTANCE_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * La IA analiza hasta 60 candidatas en lotes pequeños de 4. Este trabajo
 * corre en segundo plano: el ranking determinista completo llega primero y
 * la pantalla se actualiza cuando terminan los lotes.
 */
const AI_BATCH_SIZE = 4;
const AI_BATCH_CONCURRENCY = 2;
const MAX_AI_CANDIDATES = 60;

@Injectable()
export class UniversityMatchService {
  private readonly logger = new Logger(UniversityMatchService.name);
  private readonly groq: Groq | null;
  /** Evita duplicar el mismo análisis mientras el frontend consulta su avance. */
  private readonly aiJobsInFlight = new Map<string, Promise<void>>();
  /** Evita repetir Distance Matrix en cada consulta de progreso de A8. */
  private readonly distanceCache = new Map<
    string,
    { expiresAt: number; values: [string, number][] }
  >();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(University)
    private readonly universityRepository: Repository<University>,
    @InjectRepository(UniversityMatchCache)
    private readonly cacheRepository: Repository<UniversityMatchCache>,
    @InjectRepository(VocationalTest)
    private readonly testsRepository: Repository<VocationalTest>,
    @InjectRepository(AiLog)
    private readonly aiLogRepository: Repository<AiLog>,
  ) {
    const groqKey = this.configService.get<string>('GROQ_API_KEY');

    this.groq = groqKey ? new Groq({ apiKey: groqKey }) : null;

    if (!groqKey) {
      this.logger.error(
        'CRITICAL: GROQ_API_KEY no está configurada. A8 responderá siempre con ranking determinista (sin explicación de IA).',
      );
    }
  }

  async matchUniversities(
    userId: string,
    request: UniversityMatchRequest,
  ): Promise<UniversityMatchResponse> {
    if (
      !request?.userLocation ||
      typeof request.userLocation.lat !== 'number' ||
      typeof request.userLocation.lng !== 'number'
    ) {
      throw new RpcException('userLocation {lat, lng} es obligatorio');
    }

    const { careers, dominantAxes, calibrationLevel, profileVersion } =
      await this.resolveStudentContext(userId, request);
    if (!careers.length) {
      throw new RpcException(
        'No hay carreras recomendadas: computa el perfil (A7) antes de pedir universidades',
      );
    }

    // ── CAPA 1: candidatas deterministas dentro del radio máximo ─────────
    const candidates = await this.buildCandidates(request, careers);
    if (!candidates.length) {
      return {
        matches: [],
        generatedAt: new Date().toISOString(),
        aiAnalyzedCount: 0,
        candidateCount: 0,
        aiProcessing: false,
      };
    }

    // ── CAPA 2: lotes concurrentes de IA, cacheados ──────────────────────
    const cacheKey = this.buildCacheKey(
      request,
      careers,
      candidates,
      dominantAxes,
      calibrationLevel,
      profileVersion,
    );
    const aiResult = await this.loadCachedAdjustments(userId, cacheKey);
    const jobKey = this.buildAiJobKey(userId, cacheKey);
    const retryDelayMs = aiResult ? this.retryDelayForCache(aiResult) : 0;
    if (this.groq && (!aiResult || retryDelayMs !== null)) {
      this.startAiJob(
        userId,
        candidates,
        careers,
        dominantAxes,
        calibrationLevel,
        request,
        cacheKey,
        retryDelayMs ?? 0,
        aiResult?.adjustments ?? {},
      );
    } else if (!this.groq && !aiResult) {
      await this.requestAiAdjustments(
        userId,
        candidates,
        careers,
        dominantAxes,
        calibrationLevel,
        request,
        cacheKey,
      );
    }
    // Nunca se infiere el estado a partir de una fila parcial: solo es true si
    // este proceso realmente conserva un job activo para esa clave.
    const aiProcessing = this.aiJobsInFlight.has(jobKey);
    const adjustments = aiResult?.adjustments ?? null;

    // ── Ensamble + filtro de costo sobre el caché (sin IA) ────────────────
    // El ajuste de la IA se guardó como score sobre el baseScore NEUTRAL;
    // aquí se traduce a delta y se aplica sobre el baseScore con la
    // preferencia de costo real del request (filtros instantáneos).
    const matches: UniversityMatch[] = candidates.map((c) => {
      const adjustment = adjustments?.[c.universityId];
      const basePref = computeBaseScore({
        distanceKm: c.distanceKm,
        costTier: c.costTier,
        costPreference: request.filters.costPreference,
        rating: c.rating,
        matchType: c.matchType,
        maxDistanceKm: Math.max(
          1,
          Math.min(request.filters.maxDistanceKm, MAX_DISTANCE_KM),
        ),
      });
      const aiDelta = adjustment ? adjustment.matchScore - c.baseScore : 0;
      return {
        universityId: c.universityId,
        name: c.name,
        // La IA puede refinar a qué carrera corresponde y cuál programa real
        // es el más afín; si no lo hizo (o no pasó validación), quedan los
        // valores deterministas del match por nombre/eje.
        matchedCareer: adjustment?.matchedCareer || c.offersCareer,
        matchedProgram: adjustment?.matchedProgram || c.matchedProgram,
        aiAnalyzed: !!adjustment,
        matchScore: Math.max(0, Math.min(100, basePref + aiDelta)),
        distanceKm: c.distanceKm,
        costTier: c.costTier,
        explanation:
          adjustment?.explanation || this.deterministicExplanation(c),
        websiteUrl: c.websiteUrl,
        tuitionRange:
          c.tuitionRange === 'información no disponible'
            ? undefined
            : c.tuitionRange,
        modality:
          c.modality === 'información no disponible' ? undefined : c.modality,
        admissionDates: c.admissionDates,
        steamPrograms: c.steamPrograms,
        googleMapsData: { rating: c.rating, address: c.address },
        location: c.location,
        scoreAdjustmentReason: adjustment?.scoreAdjustmentReason,
      };
    });

    const filteredMatches = applyFiltersAndSort(matches, request.filters);
    return {
      matches: filteredMatches,
      // Para una caché, conserva la fecha real en que cambió el ranking. Esto
      // permite al cliente decidir si reemplaza su copia local sin confundir
      // cada polling con una generación nueva.
      generatedAt:
        aiResult?.updatedAt?.toISOString() ?? new Date().toISOString(),
      aiAnalyzedCount: filteredMatches.filter((match) => match.aiAnalyzed)
        .length,
      candidateCount: filteredMatches.length,
      aiProcessing,
      aiProvider:
        aiResult && aiResult.provider !== DETERMINISTIC_FALLBACK_PROVIDER
          ? aiResult.provider === PARTIAL_AI_PROVIDER
            ? 'Groq (parcial)'
            : aiResult.provider
          : 'deterministic',
    };
  }

  // ==========================================================================
  //  Contexto del estudiante (carreras A7 + perfil para el prompt)
  // ==========================================================================

  private async resolveStudentContext(
    userId: string,
    request: UniversityMatchRequest,
  ): Promise<{
    careers: RecommendedCareerInput[];
    dominantAxes: string[];
    calibrationLevel: number;
    profileVersion: string;
  }> {
    let careers = request.recommendedCareers ?? [];
    let dominantAxes: string[] = [];
    let calibrationLevel = 55;
    let profileVersion = 'request-only';

    const latestTest = await this.testsRepository.findOne({
      where: { user: { id: userId } },
      order: { completedAt: 'DESC' },
    });
    const profile = latestTest?.profile;
    if (latestTest) {
      profileVersion = [
        latestTest.id,
        latestTest.completedAt?.toISOString?.() || '',
      ].join(':');
    }
    if (profile) {
      dominantAxes = profile.dominantAxes ?? [];
      calibrationLevel = profile.calibration?.level ?? 55;
      if (!careers.length && Array.isArray(profile.recommendedCareers)) {
        careers = profile.recommendedCareers.map((c) => ({
          careerName: c.careerName,
          axis: c.axis,
        }));
      }
    }
    if (!dominantAxes.length) {
      dominantAxes = [...new Set(careers.map((c) => c.axis))];
    }
    return { careers, dominantAxes, calibrationLevel, profileVersion };
  }

  // ==========================================================================
  //  CAPA 1 — candidatas deterministas
  // ==========================================================================

  private async buildCandidates(
    request: UniversityMatchRequest,
    careers: RecommendedCareerInput[],
  ): Promise<UniversityCandidate[]> {
    const origin = request.userLocation;
    const candidates: UniversityCandidate[] = [];
    const requestedRadiusKm = Math.max(
      1,
      Math.min(request.filters.maxDistanceKm, MAX_DISTANCE_KM),
    );
    const universities = await this.findUniversitiesInBoundingBox(
      origin,
      requestedRadiusKm,
    );

    const located = universities.filter((u) => {
      if (
        typeof u.location?.latitude !== 'number' ||
        typeof u.location?.longitude !== 'number'
      ) {
        this.logger.warn(
          `Universidad "${u.name}" sin coordenadas: excluida de A8`,
        );
        return false;
      }
      // Solo educación superior: fuera prepas/secundarias/oficinas (por
      // nombre) y lo que la IA ya clasificó como no-universidad.
      if (
        isExcludedInstitutionName(u.name) ||
        (u.institutionType &&
          DISCARDED_INSTITUTION_TYPES.has(u.institutionType))
      ) {
        return false;
      }
      return true;
    });

    // La distancia recta nunca supera a la distancia por carretera. Este
    // prefiltro evita consultar y analizar instituciones que necesariamente
    // quedarán fuera del radio que eligió el alumno.
    const locatedInsideRadius = located.filter(
      (university) =>
        haversineKm(origin, {
          lat: university.location.latitude,
          lng: university.location.longitude,
        }) <= requestedRadiusKm,
    );
    // Antes de llamar Distance Matrix se descartan fichas sin oferta afín. En
    // zonas densas esto evita decenas de requests externos que nunca podían
    // convertirse en una tarjeta de A8.
    const eligible = locatedInsideRadius
      .map((university) => {
        const verifiedPrograms = recommendationPrograms(university);
        const careerMatch = findCareerMatch(
          { steamPrograms: verifiedPrograms },
          careers,
        );
        return careerMatch
          ? { university, verifiedPrograms, careerMatch }
          : null;
      })
      .filter(
        (
          value,
        ): value is {
          university: University;
          verifiedPrograms: ReturnType<typeof recommendationPrograms>;
          careerMatch: NonNullable<ReturnType<typeof findCareerMatch>>;
        } => !!value,
      );
    const distances = await this.resolveDistances(
      origin,
      eligible.map(({ university }) => university),
    );

    for (const { university, verifiedPrograms, careerMatch } of eligible) {
      const distanceKm = distances.get(university.id);
      if (distanceKm === undefined || distanceKm > requestedRadiusKm) continue;

      // Sin costTier en BD se asume 'affordable' (neutral); el admin debe
      // completar el dato para un ranking más fiel.
      const costTier = university.costTier ?? 'affordable';
      const rating = university.rating ?? undefined;

      candidates.push({
        universityId: university.id,
        name: university.name,
        offersCareer: careerMatch.careerName,
        matchType: careerMatch.matchType,
        matchedProgram: careerMatch.matchedProgram,
        distanceKm,
        costTier,
        tuitionRange: university.tuitionRange ?? 'información no disponible',
        rating,
        modality: university.modality ?? 'información no disponible',
        admissionDates: university.admissionDates ?? undefined,
        steamPrograms: verifiedPrograms,
        // baseScore NEUTRAL (preferencia 'any'): es lo que ve la IA y lo
        // que ancla el cacheKey. Así cambiar el filtro de costo NO invalida
        // el caché ni re-llama a la IA; el bono por preferencia se aplica
        // como delta al ensamblar la respuesta.
        baseScore: computeBaseScore({
          distanceKm,
          costTier,
          costPreference: 'any',
          rating,
          matchType: careerMatch.matchType,
          maxDistanceKm: requestedRadiusKm,
        }),
        websiteUrl: university.website ?? undefined,
        address: university.address ?? undefined,
        location: {
          lat: university.location.latitude,
          lng: university.location.longitude,
        },
      });
    }
    return candidates;
  }

  /**
   * Reduce en Postgres el universo de A8 antes de deserializar programas y
   * demás JSON. El filtro Haversine posterior mantiene el círculo exacto.
   */
  private async findUniversitiesInBoundingBox(
    origin: { lat: number; lng: number },
    radiusKm: number,
  ): Promise<University[]> {
    const repository = this.universityRepository as Repository<University> & {
      createQueryBuilder?: Repository<University>['createQueryBuilder'];
    };
    if (typeof repository.createQueryBuilder !== 'function') {
      // Compatibilidad con repositorios mock de pruebas unitarias.
      return this.universityRepository.find();
    }

    const latitudeDelta = radiusKm / 110.574;
    const longitudeDelta =
      radiusKm /
      (111.32 *
        Math.max(Math.abs(Math.cos((origin.lat * Math.PI) / 180)), 0.01));
    return repository
      .createQueryBuilder('university')
      .where('university.location IS NOT NULL')
      .andWhere(
        `(university.location ->> 'latitude')::double precision BETWEEN :minLat AND :maxLat`,
        {
          minLat: origin.lat - latitudeDelta,
          maxLat: origin.lat + latitudeDelta,
        },
      )
      .andWhere(
        `(university.location ->> 'longitude')::double precision BETWEEN :minLng AND :maxLng`,
        {
          minLng: origin.lng - longitudeDelta,
          maxLng: origin.lng + longitudeDelta,
        },
      )
      .getMany();
  }

  /**
   * Distancias origen→universidades. Usa Google Maps Distance Matrix si hay
   * GOOGLE_MAPS_API_KEY configurada; si no (o si falla), cae a haversine.
   */
  private async resolveDistances(
    origin: { lat: number; lng: number },
    universities: University[],
  ): Promise<Map<string, number>> {
    const distanceCacheKey = createHash('sha256')
      .update(
        JSON.stringify({
          origin: {
            lat: Math.round(origin.lat * 1000) / 1000,
            lng: Math.round(origin.lng * 1000) / 1000,
          },
          destinations: universities
            .map((university) => ({
              id: university.id,
              lat: university.location.latitude,
              lng: university.location.longitude,
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        }),
      )
      .digest('hex');
    const cached = this.distanceCache.get(distanceCacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return new Map(cached.values);
    }

    const result = new Map<string, number>();
    for (const u of universities) {
      result.set(
        u.id,
        haversineKm(origin, {
          lat: u.location.latitude,
          lng: u.location.longitude,
        }),
      );
    }

    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      this.saveDistanceCache(distanceCacheKey, result);
      return result;
    }

    try {
      const chunkSize = 25; // límite de destinos por request del API
      for (let i = 0; i < universities.length; i += chunkSize) {
        const chunk = universities.slice(i, i + chunkSize);
        const destinations = chunk
          .map((u) => `${u.location.latitude},${u.location.longitude}`)
          .join('|');
        const url =
          'https://maps.googleapis.com/maps/api/distancematrix/json' +
          `?origins=${origin.lat},${origin.lng}` +
          `&destinations=${encodeURIComponent(destinations)}` +
          `&key=${apiKey}`;
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          DISTANCE_MATRIX_TIMEOUT_MS,
        );
        let data: any;
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) {
            throw new Error(
              `Distance Matrix respondió HTTP ${response.status}`,
            );
          }
          data = await response.json();
        } finally {
          clearTimeout(timer);
        }
        const elements = data?.rows?.[0]?.elements ?? [];
        chunk.forEach((u, idx) => {
          const element = elements[idx];
          if (element?.status === 'OK' && element.distance?.value >= 0) {
            result.set(
              u.id,
              Math.round((element.distance.value / 1000) * 10) / 10,
            );
          }
        });
      }
    } catch (error) {
      this.logger.warn(
        `Distance Matrix falló, usando haversine: ${error.message}`,
      );
    }
    this.saveDistanceCache(distanceCacheKey, result);
    return result;
  }

  private saveDistanceCache(key: string, distances: Map<string, number>): void {
    // Acotado para no crecer indefinidamente en procesos de larga vida.
    if (this.distanceCache.size >= 200) {
      const oldestKey = this.distanceCache.keys().next().value as
        | string
        | undefined;
      if (oldestKey) this.distanceCache.delete(oldestKey);
    }
    this.distanceCache.set(key, {
      expiresAt: Date.now() + DISTANCE_CACHE_TTL_MS,
      values: [...distances.entries()],
    });
  }

  private deterministicExplanation(c: UniversityCandidate): string {
    const tierLabel: Record<string, string> = {
      public: 'pública',
      affordable: 'de costo accesible',
      'private-premium': 'privada',
    };
    const tier = tierLabel[c.costTier] ?? c.costTier;
    if (c.matchType === 'area' && c.matchedProgram) {
      return (
        `Ofrece ${c.matchedProgram}, un programa del área afín a tu carrera ` +
        `recomendada (${c.offersCareer}); es ${tier} y está a ${c.distanceKm} km de ti.`
      );
    }
    return `Ofrece ${c.matchedProgram || c.offersCareer}, es ${tier} y está a ${c.distanceKm} km de ti.`;
  }

  // ==========================================================================
  //  CAPA 2 — IA (ranking fino + explicación), cacheada
  // ==========================================================================

  private startAiJob(
    userId: string,
    candidates: UniversityCandidate[],
    careers: RecommendedCareerInput[],
    dominantAxes: string[],
    calibrationLevel: number,
    request: UniversityMatchRequest,
    cacheKey: string,
    delayMs = 0,
    existingAdjustments: Record<string, ValidatedAiAdjustment> = {},
  ): void {
    const jobKey = this.buildAiJobKey(userId, cacheKey);
    if (this.aiJobsInFlight.has(jobKey)) return;

    // Una caché parcial/fallback fresca sigue siendo trabajo pendiente. El job
    // queda registrado desde ahora (por eso el cliente continúa sondeando),
    // espera el backoff restante y reintenta sin exigir otra visita o recarga.
    const job = (async () => {
      if (delayMs > 0) await this.waitForAiRetry(delayMs);
      return this.requestAiAdjustments(
        userId,
        candidates,
        careers,
        dominantAxes,
        calibrationLevel,
        request,
        cacheKey,
        existingAdjustments,
      );
    })()
      .then(() => undefined)
      .catch((error) => {
        this.logger.error(
          `A8 en segundo plano falló: ${this.describeProviderError(error)}`,
        );
      })
      .finally(() => this.aiJobsInFlight.delete(jobKey));
    this.aiJobsInFlight.set(jobKey, job);
  }

  private waitForAiRetry(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, delayMs);
      timer.unref?.();
    });
  }

  private buildAiJobKey(userId: string, cacheKey: string): string {
    return `${userId}:${cacheKey}`;
  }

  private buildCacheKey(
    request: UniversityMatchRequest,
    careers: RecommendedCareerInput[],
    candidates: UniversityCandidate[],
    dominantAxes: string[],
    calibrationLevel: number,
    profileVersion: string,
  ): string {
    const payload = {
      version: A8_CACHE_VERSION,
      profile: {
        version: profileVersion,
        dominantAxes,
        calibrationLevel,
      },
      // El orden de A7 es significativo: la primera carrera tiene prioridad
      // en el match determinista y no debe colapsarse mediante sort().
      careers: careers.map((career) => ({
        careerName: career.careerName,
        axis: career.axis,
      })),
      location: {
        lat: Math.round(request.userLocation.lat * 1000) / 1000,
        lng: Math.round(request.userLocation.lng * 1000) / 1000,
      },
      maxDistanceKm: Math.max(
        1,
        Math.min(request.filters.maxDistanceKm, MAX_DISTANCE_KM),
      ),
      candidates: candidates
        .map((c) => ({
          id: c.universityId,
          name: c.name,
          score: c.baseScore,
          offersCareer: c.offersCareer,
          matchType: c.matchType,
          matchedProgram: c.matchedProgram,
          distanceKm: c.distanceKm,
          costTier: c.costTier,
          tuitionRange: c.tuitionRange,
          rating: c.rating,
          modality: c.modality,
          programs: (c.steamPrograms || [])
            .map((program) => `${program.name}:${program.area}`)
            .sort(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async loadCachedAdjustments(
    userId: string,
    cacheKey: string,
  ): Promise<{
    adjustments: Record<string, ValidatedAiAdjustment>;
    provider: string;
    updatedAt: Date;
  } | null> {
    const row = await this.cacheRepository.findOne({
      where: { userId, cacheKey },
    });
    if (!row) return null;

    // Incluso vencida se conserva la fotografía parcial para mostrarla durante
    // el reintento; el caller decide si inicia un nuevo trabajo.
    return {
      adjustments: row.aiAdjustments,
      provider: row.provider,
      updatedAt: row.updatedAt,
    };
  }

  private retryDelayForCache(cache: {
    provider: string;
    updatedAt: Date;
  }): number | null {
    const ageMs = Date.now() - cache.updatedAt.getTime();
    if (cache.provider === DETERMINISTIC_FALLBACK_PROVIDER) {
      return Math.max(0, FALLBACK_CACHE_TTL_MS - ageMs);
    }
    if (cache.provider === PARTIAL_AI_PROVIDER) {
      return Math.max(0, PARTIAL_CACHE_TTL_MS - ageMs);
    }
    return null;
  }

  private async requestAiAdjustments(
    userId: string,
    candidates: UniversityCandidate[],
    careers: RecommendedCareerInput[],
    dominantAxes: string[],
    calibrationLevel: number,
    request: UniversityMatchRequest,
    cacheKey: string,
    existingAdjustments: Record<string, ValidatedAiAdjustment> = {},
  ): Promise<{
    adjustments: Record<string, ValidatedAiAdjustment>;
    provider: string;
  } | null> {
    // Se prioriza por baseScore, pero todas las candidatas visibles en una
    // zona normal caben en los lotes (hasta 60).
    const aiCandidates = [...candidates]
      .sort((a, b) => b.baseScore - a.baseScore)
      .slice(0, MAX_AI_CANDIDATES);

    if (!this.groq) {
      this.logger.warn('A8: Groq deshabilitado (sin API key), se omite.');
      await this.upsertCache(
        userId,
        cacheKey,
        {},
        DETERMINISTIC_FALLBACK_PROVIDER,
      );
      return null;
    }

    // Un reintento continúa desde la fotografía parcial ya publicada. Así no
    // borra explicaciones visibles ni vuelve a cobrar por candidatas resueltas.
    const combined: Record<string, ValidatedAiAdjustment> = {
      ...existingAdjustments,
    };
    const pendingCandidates = aiCandidates.filter(
      (candidate) => !combined[candidate.universityId],
    );
    if (!pendingCandidates.length) {
      await this.upsertCache(userId, cacheKey, combined, 'Groq');
      return { adjustments: combined, provider: 'Groq' };
    }

    const batches: UniversityCandidate[][] = [];
    for (
      let index = 0;
      index < pendingCandidates.length;
      index += AI_BATCH_SIZE
    ) {
      batches.push(pendingCandidates.slice(index, index + AI_BATCH_SIZE));
    }

    const startTime = Date.now();
    const batchErrors: string[] = [];
    let totalTokens = 0;
    let successfulBatches = 0;

    const executeBatches = async (pendingBatches: UniversityCandidate[][]) => {
      for (
        let index = 0;
        index < pendingBatches.length;
        index += AI_BATCH_CONCURRENCY
      ) {
        const wave = pendingBatches.slice(index, index + AI_BATCH_CONCURRENCY);
        const results = await Promise.allSettled(
          wave.map(async (batch) => {
            const prompt = this.buildPrompt(
              batch,
              careers,
              dominantAxes,
              calibrationLevel,
              request,
            );
            const { text, tokens } = await this.withTimeout(
              this.callGroq(prompt),
              PROVIDER_TIMEOUT_MS,
              'Groq',
            );
            const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
            return {
              tokens,
              adjustments: validateAiMatches(
                parsed?.matches ?? [],
                batch,
                careers,
              ),
            };
          }),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            successfulBatches++;
            totalTokens += result.value.tokens;
            Object.assign(combined, result.value.adjustments);
          } else {
            const detail = this.describeProviderError(result.reason);
            batchErrors.push(detail);
            this.logger.error(`A8: un lote de Groq falló: ${detail}`);
          }
        }

        // Publica el avance al terminar CADA oleada. Así el polling recibe
        // nuevas explicaciones mientras el resto continúa, y un reinicio no
        // pierde todo lo que ya respondió el proveedor.
        if (Object.keys(combined).length) {
          await this.upsertCache(
            userId,
            cacheKey,
            combined,
            PARTIAL_AI_PROVIDER,
          );
        }
      }
    };

    await executeBatches(batches);

    // Si el modelo omitió universidades a pesar de la instrucción de incluir
    // todas, se hace un segundo intento solo con las faltantes. El flujo
    // anterior cacheaba esa respuesta incompleta para siempre y por eso a
    // algunos usuarios les aparecían únicamente dos tarjetas con IA.
    const missingAfterFirstPass = aiCandidates.filter(
      (candidate) => !combined[candidate.universityId],
    );
    if (missingAfterFirstPass.length) {
      const retryBatches: UniversityCandidate[][] = [];
      for (
        let index = 0;
        index < missingAfterFirstPass.length;
        index += AI_BATCH_SIZE
      ) {
        retryBatches.push(
          missingAfterFirstPass.slice(index, index + AI_BATCH_SIZE),
        );
      }
      await executeBatches(retryBatches);
    }

    if (successfulBatches > 0) {
      const missingCount = aiCandidates.filter(
        (candidate) => !combined[candidate.universityId],
      ).length;
      const isPartial = missingCount > 0;
      await this.saveLog(
        userId,
        dominantAxes.join(' + '),
        Date.now() - startTime,
        true,
        isPartial
          ? `Resultado parcial: ${missingCount} omitidas. ${batchErrors.join(' | ')}`
          : batchErrors.length
            ? `Recuperado tras reintento: ${batchErrors.join(' | ')}`
            : '',
        totalTokens,
        'Groq',
      );
      const provider = isPartial ? PARTIAL_AI_PROVIDER : 'Groq';
      await this.upsertCache(userId, cacheKey, combined, provider);
      return { adjustments: combined, provider };
    }

    await this.saveLog(
      userId,
      dominantAxes.join(' + '),
      Date.now() - startTime,
      false,
      batchErrors.join(' | ') || 'Ningún lote de Groq respondió',
      totalTokens,
      'Groq',
    );

    if (Object.keys(combined).length) {
      // Un proveedor caído durante el reintento no debe borrar el avance que
      // el alumno ya estaba viendo. Conservamos la fotografía y aplicamos un
      // nuevo backoff parcial antes del siguiente intento automático.
      await this.upsertCache(userId, cacheKey, combined, PARTIAL_AI_PROVIDER);
      return { adjustments: combined, provider: PARTIAL_AI_PROVIDER };
    }

    // Degradación limpia: ranking 100% determinista (matchScore = baseScore).
    // Se cachea con TTL corto (FALLBACK_CACHE_TTL_MS) para que los clicks de
    // filtro no vuelvan a martillar un proveedor caído en cada request.
    this.logger.warn('A8 sin IA disponible: se responde solo con baseScore');
    await this.upsertCache(
      userId,
      cacheKey,
      {},
      DETERMINISTIC_FALLBACK_PROVIDER,
    );
    return null;
  }

  /** Crea o actualiza la fila de caché para userId+cacheKey (evita duplicados). */
  private async upsertCache(
    userId: string,
    cacheKey: string,
    aiAdjustments: Record<string, ValidatedAiAdjustment>,
    provider: string,
  ): Promise<void> {
    const existing = await this.cacheRepository.findOne({
      where: { userId, cacheKey },
    });
    if (existing) {
      existing.aiAdjustments = aiAdjustments;
      existing.provider = provider;
      await this.cacheRepository.save(existing);
    } else {
      await this.cacheRepository.save(
        this.cacheRepository.create({
          userId,
          cacheKey,
          aiAdjustments,
          provider,
        }),
      );
    }
  }

  /** Corta una llamada a proveedor que tarde más de `ms` (evita cuelgues). */
  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    provider: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout de ${ms}ms esperando a ${provider}`)),
        ms,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  /** Extrae el detalle más útil de un error de SDK de IA (status/code + mensaje). */
  private describeProviderError(error: any): string {
    const status = error?.status ?? error?.response?.status ?? error?.code;
    const message = error?.message || String(error);
    return status ? `[${status}] ${message}` : message;
  }

  private async callGroq(
    prompt: string,
  ): Promise<{ text: string; tokens: number }> {
    if (!this.groq) throw new Error('Groq no configurado (sin API key)');
    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      // Cada llamada incluye únicamente cuatro candidatas, así que este margen
      // alcanza para sus explicaciones sin permitir respuestas innecesariamente largas.
      max_tokens: 2500,
    });
    return {
      text: completion.choices[0]?.message?.content || '{}',
      tokens: completion.usage?.total_tokens || 0,
    };
  }

  /**
   * Prompt basado en `algoritmo-universidades-IA.md` (sección 4), extendido:
   * la IA ahora también hace el juicio semántico carrera↔programa — recibe
   * la oferta educativa completa de cada candidata y decide qué programa
   * REAL es el más afín a las carreras recomendadas del alumno (equivalencias
   * que el match literal no ve). Reglas anti-alucinación intactas.
   */
  private buildPrompt(
    candidates: UniversityCandidate[],
    careers: RecommendedCareerInput[],
    dominantAxes: string[],
    calibrationLevel: number,
    request: UniversityMatchRequest,
  ): string {
    const entrada = {
      studentProfile: {
        dominantAxes,
        calibrationLevel,
      },
      recommendedCareers: careers.map((c) => ({
        careerName: c.careerName,
        axis: c.axis,
      })),
      filters: {
        maxDistanceKm: request.filters.maxDistanceKm,
      },
      candidateUniversities: candidates.map((c) => ({
        universityId: c.universityId,
        name: c.name,
        // Match determinista de partida (la IA puede refinarlo):
        matchType: c.matchType, // 'direct' = nombre coincide | 'area' = mismo eje STEAM
        offersCareer: c.offersCareer, // carrera recomendada que hizo match
        matchedProgram: c.matchedProgram, // programa real que lo produjo
        steamPrograms: (c.steamPrograms || []).map((p) => ({
          name: p.name,
          area: p.area,
        })),
        distanceKm: c.distanceKm,
        costTier: c.costTier,
        tuitionRange: c.tuitionRange,
        rating: c.rating ?? 'información no disponible',
        modality: c.modality,
        baseScore: c.baseScore,
      })),
    };

    return `SISTEMA:
Eres un orientador vocacional imparcial para estudiantes de México. Tu tarea es
RANKEAR y EXPLICAR universidades de una lista que se te entrega, identificando
para cada una el programa académico REAL más afín al perfil del estudiante.
Trabajas para un estudiante real que necesita una decisión justa y honesta.

REGLAS ESTRICTAS:
1. SOLO puedes usar universidades de la lista proporcionada. NUNCA inventes
   universidades, carreras, colegiaturas, fechas ni datos que no estén en la lista.
2. "matchedProgram" debe ser EXACTAMENTE uno de los nombres en "steamPrograms" de
   esa universidad (cópialo literal, sin reescribirlo). "matchedCareer" debe ser
   EXACTAMENTE una de las "recommendedCareers". Elige el par programa↔carrera con
   mayor afinidad semántica: reconoce equivalencias reales aunque el nombre no
   coincida (ej. "Ingeniería en Sistemas Computacionales" es afín a "Ingeniería en
   Software"; "Licenciatura en Medicina" a "Médico Cirujano"). Si ningún programa
   es afín de verdad a ninguna carrera recomendada, conserva los valores de
   "offersCareer"/"matchedProgram" que vienen en la entrada.
3. Si te falta un dato, dilo explícitamente ("información no disponible"); no lo supongas.
4. El % de match que devuelvas debe partir del "baseScore" dado. Puedes ajustarlo
   como máximo ±15 puntos, y debes justificar el ajuste con datos de la lista.
   Sube más cuando el programa es una equivalencia semántica fuerte de la carrera
   recomendada; baja cuando la afinidad es solo del área general.
5. "explanation": 1-3 frases personalizadas dirigidas al estudiante, citando su
   perfil dominante (${dominantAxes.join(' + ') || 'STEAM'}), el programa concreto
   y datos duros de la lista (distancia, costo, modalidad, rating). NADA más.

ANTI-SESGO (obligatorio):
6. NO favorezcas universidades por prestigio, fama o por ser privadas/caras.
   Una universidad pública o económica que ofrece el mismo programa cerca del
   estudiante es IGUAL o MÁS valiosa.
7. Presenta un balance: no devuelvas solo opciones caras. Si hay opciones
   públicas/accesibles válidas, deben aparecer arriba cuando los datos lo respalden.
8. No asumas el género, nivel socioeconómico, etnia ni capacidades del estudiante.
9. No uses estereotipos de carrera ("esto es para hombres/mujeres", etc.).
10. Si dos universidades empatan en datos, prioriza la más accesible
    económicamente y la más cercana.

ENTRADA (JSON):
${JSON.stringify(entrada, null, 2)}

SALIDA (JSON estricto, sin texto extra) — incluye TODAS las universidades de la lista:
{
  "matches": [
    {
      "universityId": "uuid",
      "matchedCareer": "Ingeniería en Software",
      "matchedProgram": "Ingeniería en Sistemas Computacionales",
      "matchScore": 88,
      "explanation": "Con tu perfil dominante en tecnología, su Ingeniería en Sistemas Computacionales cubre lo mismo que la carrera que te recomendamos. Es pública, está a 12 km de ti y su rating es 4.5.",
      "scoreAdjustmentReason": "+8: equivalencia semántica fuerte con la carrera recomendada"
    }
  ]
}
    `;
  }

  private async saveLog(
    studentName: string,
    detectedProfile: string,
    latency: number,
    success: boolean,
    errorMessage: string,
    tokensConsumed: number,
    provider: string,
  ) {
    try {
      const log = this.aiLogRepository.create({
        studentName,
        detectedProfile,
        latency,
        success,
        errorMessage,
        tokensConsumed,
        provider,
      });
      await this.aiLogRepository.save(log);
    } catch (err) {
      this.logger.error('Error saving AI log', err);
    }
  }
}
