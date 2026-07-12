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

/**
 * A8 — Matching de universidades en 2 capas (arquitectura obligatoria):
 *
 *   CAPA 1 (determinista): match duro por programa en BD, distancia,
 *   costo y baseScore. Corre siempre, sin IA.
 *
 *   CAPA 2 (IA): UNA llamada con la lista candidata; la IA solo ajusta
 *   el baseScore (±10 máx) y redacta la explicación. Salida validada:
 *   universidades fuera de la lista se descartan. El resultado se cachea
 *   y los filtros (km, costo) se aplican sobre el caché al instante.
 */
/** Nombre de proveedor con el que se cachea la degradación cuando la IA falla. */
const DETERMINISTIC_FALLBACK_PROVIDER = 'deterministic-fallback';

/** Cuánto dura el caché de un fallo de IA antes de reintentar (evita martillar un proveedor caído en cada click de filtro). */
const FALLBACK_CACHE_TTL_MS = 3 * 60 * 1000;

/** Máximo tiempo de espera por intento de proveedor antes de darlo por caído. */
const PROVIDER_TIMEOUT_MS = 12_000;

/**
 * Máximo de candidatas que se le pasan a la IA (las top por baseScore).
 * Con el matching por eje STEAM el pool puede crecer mucho; el resto de
 * candidatas igual sale en la respuesta con su ranking determinista.
 */
const MAX_AI_CANDIDATES = 25;

@Injectable()
export class UniversityMatchService {
  private readonly logger = new Logger(UniversityMatchService.name);
  private readonly groq: Groq | null;

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

    const { careers, dominantAxes, calibrationLevel } =
      await this.resolveStudentContext(userId, request);
    if (!careers.length) {
      throw new RpcException(
        'No hay carreras recomendadas: computa el perfil (A7) antes de pedir universidades',
      );
    }

    // ── CAPA 1: candidatas deterministas dentro del radio máximo ─────────
    const candidates = await this.buildCandidates(request, careers);
    if (!candidates.length) {
      return { matches: [], generatedAt: new Date().toISOString() };
    }

    // ── CAPA 2: una llamada a la IA, cacheada ─────────────────────────────
    const cacheKey = this.buildCacheKey(request, careers, candidates);
    let aiResult = await this.loadCachedAdjustments(userId, cacheKey);
    if (!aiResult) {
      aiResult = await this.requestAiAdjustments(
        userId,
        candidates,
        careers,
        dominantAxes,
        calibrationLevel,
        request,
        cacheKey,
      );
    }
    const adjustments = aiResult?.adjustments ?? null;

    // ── Ensamble + filtros sobre el caché (sin IA) ────────────────────────
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
        matchScore: Math.max(0, Math.min(100, basePref + aiDelta)),
        distanceKm: c.distanceKm,
        costTier: c.costTier,
        explanation:
          adjustment?.explanation || this.deterministicExplanation(c),
        websiteUrl: c.websiteUrl,
        tuitionRange:
          c.tuitionRange === 'información no disponible' ? undefined : c.tuitionRange,
        modality:
          c.modality === 'información no disponible' ? undefined : c.modality,
        steamPrograms: c.steamPrograms,
        googleMapsData: { rating: c.rating, address: c.address },
        location: c.location,
        scoreAdjustmentReason: adjustment?.scoreAdjustmentReason,
      };
    });

    return {
      matches: applyFiltersAndSort(matches, request.filters),
      generatedAt: new Date().toISOString(),
      aiProvider:
        aiResult && aiResult.provider !== DETERMINISTIC_FALLBACK_PROVIDER
          ? aiResult.provider
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
  }> {
    let careers = request.recommendedCareers ?? [];
    let dominantAxes: string[] = [];
    let calibrationLevel = 55;

    const latestTest = await this.testsRepository.findOne({
      where: { user: { id: userId } },
      order: { completedAt: 'DESC' },
    });
    const profile = latestTest?.profile;
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
    return { careers, dominantAxes, calibrationLevel };
  }

  // ==========================================================================
  //  CAPA 1 — candidatas deterministas
  // ==========================================================================

  private async buildCandidates(
    request: UniversityMatchRequest,
    careers: RecommendedCareerInput[],
  ): Promise<UniversityCandidate[]> {
    const universities = await this.universityRepository.find();
    const origin = request.userLocation;
    const candidates: UniversityCandidate[] = [];

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
      return true;
    });

    const distances = await this.resolveDistances(origin, located);

    for (const university of located) {
      // Matching en 2 niveles: directo (nombre) o por eje STEAM (área).
      // Solo se excluye si no tiene programas o ninguno cae en los ejes
      // recomendados.
      const careerMatch = findCareerMatch(university, careers);
      if (!careerMatch) continue;

      const distanceKm = distances.get(university.id);
      if (distanceKm === undefined || distanceKm > MAX_DISTANCE_KM) continue;

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
        steamPrograms: university.steamPrograms ?? undefined,
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
   * Distancias origen→universidades. Usa Google Maps Distance Matrix si hay
   * GOOGLE_MAPS_API_KEY configurada; si no (o si falla), cae a haversine.
   */
  private async resolveDistances(
    origin: { lat: number; lng: number },
    universities: University[],
  ): Promise<Map<string, number>> {
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
    if (!apiKey) return result;

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
        const response = await fetch(url);
        const data: any = await response.json();
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
    return result;
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
    return `Ofrece ${c.offersCareer}, es ${tier} y está a ${c.distanceKm} km de ti.`;
  }

  // ==========================================================================
  //  CAPA 2 — IA (ranking fino + explicación), cacheada
  // ==========================================================================

  private buildCacheKey(
    request: UniversityMatchRequest,
    careers: RecommendedCareerInput[],
    candidates: UniversityCandidate[],
  ): string {
    const payload = {
      careers: careers.map((c) => c.careerName).sort(),
      location: {
        lat: Math.round(request.userLocation.lat * 1000) / 1000,
        lng: Math.round(request.userLocation.lng * 1000) / 1000,
      },
      candidates: candidates
        .map((c) => `${c.universityId}:${c.baseScore}`)
        .sort(),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async loadCachedAdjustments(
    userId: string,
    cacheKey: string,
  ): Promise<{
    adjustments: Record<string, ValidatedAiAdjustment>;
    provider: string;
  } | null> {
    const row = await this.cacheRepository.findOne({
      where: { userId, cacheKey },
    });
    if (!row) return null;

    // La degradación (IA caída) se cachea con TTL corto: pasado ese tiempo
    // se reintenta por si el proveedor ya se recuperó.
    if (row.provider === DETERMINISTIC_FALLBACK_PROVIDER) {
      const ageMs = Date.now() - row.updatedAt.getTime();
      if (ageMs > FALLBACK_CACHE_TTL_MS) return null;
    }
    return { adjustments: row.aiAdjustments, provider: row.provider };
  }

  private async requestAiAdjustments(
    userId: string,
    candidates: UniversityCandidate[],
    careers: RecommendedCareerInput[],
    dominantAxes: string[],
    calibrationLevel: number,
    request: UniversityMatchRequest,
    cacheKey: string,
  ): Promise<{
    adjustments: Record<string, ValidatedAiAdjustment>;
    provider: string;
  } | null> {
    // Solo las mejores candidatas van al prompt (control de tokens); el
    // resto sale igual en la respuesta con su ranking determinista.
    const aiCandidates = [...candidates]
      .sort((a, b) => b.baseScore - a.baseScore)
      .slice(0, MAX_AI_CANDIDATES);

    const prompt = this.buildPrompt(
      aiCandidates,
      careers,
      dominantAxes,
      calibrationLevel,
      request,
    );

    if (!this.groq) {
      this.logger.warn('A8: Groq deshabilitado (sin API key), se omite.');
      await this.upsertCache(userId, cacheKey, {}, DETERMINISTIC_FALLBACK_PROVIDER);
      return null;
    }

    const startTime = Date.now();
    try {
      const { text, tokens } = await this.withTimeout(
        this.callGroq(prompt),
        PROVIDER_TIMEOUT_MS,
        'Groq',
      );
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const validated = validateAiMatches(
        parsed?.matches ?? [],
        aiCandidates,
        careers,
      );

      await this.saveLog(
        userId,
        dominantAxes.join(' + '),
        Date.now() - startTime,
        true,
        '',
        tokens,
        'Groq',
      );

      // Cachear solo resultados exitosos: los filtros posteriores se
      // aplican sobre este caché sin volver a llamar a la IA.
      await this.upsertCache(userId, cacheKey, validated, 'Groq');
      return { adjustments: validated, provider: 'Groq' };
    } catch (error) {
      const detail = this.describeProviderError(error);
      this.logger.error(`A8 falló con Groq: ${detail}`);
      await this.saveLog(
        userId,
        dominantAxes.join(' + '),
        Date.now() - startTime,
        false,
        detail,
        0,
        'Groq',
      );
    }

    // Degradación limpia: ranking 100% determinista (matchScore = baseScore).
    // Se cachea con TTL corto (FALLBACK_CACHE_TTL_MS) para que los clicks de
    // filtro no vuelvan a martillar un proveedor caído en cada request.
    this.logger.warn('A8 sin IA disponible: se responde solo con baseScore');
    await this.upsertCache(userId, cacheKey, {}, DETERMINISTIC_FALLBACK_PROVIDER);
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
        this.cacheRepository.create({ userId, cacheKey, aiAdjustments, provider }),
      );
    }
  }

  /** Corta una llamada a proveedor que tarde más de `ms` (evita cuelgues). */
  private withTimeout<T>(promise: Promise<T>, ms: number, provider: string): Promise<T> {
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
      // La salida ahora trae matchedCareer/matchedProgram/explicación por
      // cada una de hasta 25 candidatas: 3000 quedaba justo y truncaba el JSON.
      max_tokens: 4000,
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
        costPreference: request.filters.costPreference,
      },
      candidateUniversities: candidates.map((c) => ({
        universityId: c.universityId,
        name: c.name,
        // Match determinista de partida (la IA puede refinarlo):
        matchType: c.matchType,        // 'direct' = nombre coincide | 'area' = mismo eje STEAM
        offersCareer: c.offersCareer,  // carrera recomendada que hizo match
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
