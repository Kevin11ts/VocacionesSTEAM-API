import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Groq from 'groq-sdk';
import { AiLog, University } from '@app/common';
import { haversineKm } from './university-match.engine';
import {
  DISCARDED_INSTITUTION_TYPES,
  isExcludedInstitutionName,
} from './institution-filter';
import {
  OfficialSitePage,
  recommendationPrograms,
  verifyProgramsAgainstOfficialPages,
} from './program-verification';

/**
 * Servicio del microservicio de IA.
 *
 * La generación del perfil vocacional con Gemini/Groq fue REEMPLAZADA por
 * el motor determinista (A1-A7) en apps/tests. La única capacidad de IA
 * que sobrevive es el matching de universidades (A8), implementado en
 * UniversityMatchService con arquitectura híbrida datos duros + IA.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly groq: Groq | null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiLog)
    private readonly aiLogRepository: Repository<AiLog>,
    @InjectRepository(University)
    private readonly universityRepository: Repository<University>,
  ) {
    const groqKey = this.configService.get<string>('GROQ_API_KEY');
    this.groq = groqKey ? new Groq({ apiKey: groqKey }) : null;
  }

  async getLogsStats() {
    const totalLogs = await this.aiLogRepository.count();
    if (totalLogs === 0) {
      return {
        successRate: '0%',
        averageLatency: '0ms',
        totalTokens: '0',
        recentLogs: [],
      };
    }

    const successfulLogs = await this.aiLogRepository.count({
      where: { success: true },
    });
    const successRate = ((successfulLogs / totalLogs) * 100).toFixed(1) + '%';

    const { avgLatency, sumTokens } = await this.aiLogRepository
      .createQueryBuilder('log')
      .select('AVG(log.latency)', 'avgLatency')
      .addSelect('SUM(log.tokensConsumed)', 'sumTokens')
      .getRawOne();

    const recentLogs = await this.aiLogRepository.find({
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const formatTokens = (tokens: number) => {
      if (!tokens) return '0';
      if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
      if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'k';
      return tokens.toString();
    };

    return {
      successRate,
      averageLatency: `${Math.round(avgLatency || 0)}ms`,
      totalTokens: formatTokens(sumTokens),
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        date: log.createdAt,
        studentName: log.studentName,
        detectedProfile: log.detectedProfile,
        latency: `${Math.round(log.latency)}ms`,
        status: log.success ? 'Éxito' : 'Error',
      })),
    };
  }

  // --- Universities CRUD ---
  async getUniversities(): Promise<University[]> {
    return this.universityRepository.find();
  }

  /**
   * Universidades de NUESTRA base cercanas a una coordenada, con todos los
   * campos (programas/costo/modalidad, incluidos los enriquecidos por IA).
   * Alimenta la sección "cerca de ti" de Explorar, que antes venía solo de
   * Google Places y por eso mostraba únicamente datos básicos del mapa.
   */
  async getNearbyUniversities(
    lat: number,
    lng: number,
    radiusKm = 25,
    limit = 40,
  ): Promise<(University & { distanceKm: number })[]> {
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      throw new Error('lat y lng son obligatorios');
    }
    const all = await this.universityRepository.find();
    return all
      .filter(
        (u) =>
          typeof u.location?.latitude === 'number' &&
          typeof u.location?.longitude === 'number' &&
          // Solo educación superior: fuera prepas/secundarias/oficinas que
          // se hayan colado en corridas viejas (por nombre) y lo que la IA
          // ya clasificó como no-universidad (por institutionType).
          !isExcludedInstitutionName(u.name) &&
          !(
            u.institutionType &&
            DISCARDED_INSTITUTION_TYPES.has(u.institutionType)
          ),
      )
      .map((u) => ({
        ...u,
        // Nunca se expone ni usa en A8 un catálogo automático antiguo que
        // no tenga evidencia oficial o curación explícita del administrador.
        steamPrograms: recommendationPrograms(u),
        distanceKm: haversineKm(
          { lat, lng },
          { lat: u.location.latitude, lng: u.location.longitude },
        ),
      }))
      .filter((u) => u.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  /**
   * Cobertura mínima de zona: con menos de esto en BD se activa el pipeline
   * de descubrimiento/enriquecimiento para que el alumno vea una lista útil
   * (15-20 universidades), no 3 tarjetas sueltas.
   */
  private static readonly MIN_ZONE_COVERAGE = 15;

  /**
   * Presupuesto de trabajos con IA por request síncrono (existentes a
   * enriquecer + nuevos a validar). Se procesan en chunks paralelos de
   * ENRICH_CHUNK_SIZE: 12 trabajos ≈ 4 oleadas × ~10-12s. Cada prompt se
   * mantiene corto para respetar también límites por tokens del proveedor.
   * peor caso — dentro del timeout del proxy de Railway, y respetando el
   * rate limit de Groq (no 12 llamadas simultáneas).
   */
  private static readonly MAX_SYNC_ENRICH = 12;
  private static readonly ENRICH_CHUNK_SIZE = 3;

  /**
   * "Cerca de ti" (Explorar) y el mapa: BD propia como fuente principal; si
   * la zona tiene poca cobertura (<MIN_ZONE_COVERAGE), el pipeline hace DOS
   * cosas con un presupuesto compartido de MAX_SYNC_ENRICH trabajos de IA:
   *
   *   1. ENRIQUECE universidades EXISTENTES de la zona sin steamPrograms
   *      (con website directo, o consiguiéndolo vía Place Details si tienen
   *      googlePlaceId) — son las tarjetas que hoy se ven "vacías" y además
   *      son las que activan el matching de A8.
   *   2. DESCUBRE universidades nuevas vía Google Places EN EL SERVIDOR
   *      (la key nunca se expone al cliente), las valida/clasifica con IA
   *      (descartando lo que no es educación superior) y las guarda.
   *
   * Todo queda persistido: la siguiente visita a la zona responde al
   * instante sin volver a preguntarle a Places ni a la IA por lo mismo.
   *
   * Síncrono a propósito (decisión del producto): el usuario espera. Los
   * trabajos corren en chunks paralelos de ENRICH_CHUNK_SIZE para caber en
   * el timeout del proxy sin martillar el rate limit de Groq. Lo que no
   * quepa en el presupuesto no se pierde: la próxima búsqueda en la zona
   * procesa el siguiente lote.
   */
  async findOrDiscoverNearby(
    lat: number,
    lng: number,
    radiusKm = 25,
  ): Promise<(University & { distanceKm: number })[]> {
    const dbNearby = await this.getNearbyUniversities(lat, lng, radiusKm);

    // Dos gates independientes: "cuántas hay" (activa descubrir nuevas en
    // Places) y "cuántas SIRVEN" — tienen programas verificados, o sea
    // activan A8 y muestran ficha completa (activa enriquecer existentes).
    // Antes había un
    // solo gate por cantidad total: en zonas densas (CDMX) ya hay >15
    // registros crudos desde el primer request, así que la función
    // retornaba de inmediato y el enriquecimiento NUNCA se disparaba —
    // aunque casi ninguno tuviera programas. Ver findOrDiscoverNearby en el
    // plan de corrección para el detalle del bug.
    const withPrograms = dbNearby.filter(
      (u) => recommendationPrograms(u).length,
    ).length;
    const needsMoreCoverage = dbNearby.length < AiService.MIN_ZONE_COVERAGE;
    const needsEnrichment = withPrograms < AiService.MIN_ZONE_COVERAGE;
    if (!needsMoreCoverage && !needsEnrichment) return dbNearby;

    const apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY');
    let budget = AiService.MAX_SYNC_ENRICH;
    // Cuando la zona aún tiene pocas instituciones, se reserva la mitad del
    // presupuesto para descubrir nuevas. Antes los registros incompletos
    // consumían siempre los 12 lugares y Places nunca llegaba a ejecutarse;
    // por eso ampliar de 10 a 30/50 km mostraba exactamente la misma lista.
    const discoveryReserve =
      needsMoreCoverage && apiKey
        ? Math.floor(AiService.MAX_SYNC_ENRICH / 2)
        : 0;

    // ── 1) Existentes sin oferta verificada: enriquecerlas primero ─────────
    // Son las más baratas (sin Place Details si ya tienen website), son las
    // que el alumno ya está viendo "vacías", y son las que activan A8.
    // Los catálogos automáticos heredados también entran: tener carreras
    // guardadas ya no equivale a que sean reales para esa institución/sede.
    //
    // OJO: no se exige tener ya `website` o `googlePlaceId` — la inmensa
    // mayoría de la BD viene de descubrimientos viejos (botón admin de
    // Places, DENUE) que NUNCA guardaron ninguno de los dos, así que exigirlo
    // aquí dejaba a ese universo entero sin poder enriquecerse jamás.
    // enrichExistingUniversity() ahora resuelve el place_id por nombre+
    // dirección cuando falta (findPlaceId), así que basta con requerir
    // `location` (siempre presente, es requisito para aparecer en "cerca de
    // ti") y que haya API key para poder buscar en Places.
    if (needsEnrichment && this.groq && budget > 0) {
      const enrichmentBudget = budget - discoveryReserve;
      const toEnrich = dbNearby
        .filter(
          (u) =>
            !u.programsVerifiedAt &&
            !u.programsVerificationSource &&
            !(u.source === 'manual' && u.steamPrograms?.length) &&
            (u.website?.trim() || apiKey),
        )
        // No repetir eternamente el mismo primer lote: nunca verificadas
        // primero y después el intento más antiguo (updatedAt rota al guardar).
        .sort((a, b) => {
          const aUnverified = a.programsVerifiedAt ? 1 : 0;
          const bUnverified = b.programsVerifiedAt ? 1 : 0;
          if (aUnverified !== bUnverified) return aUnverified - bUnverified;
          return a.updatedAt.getTime() - b.updatedAt.getTime();
        })
        .slice(0, enrichmentBudget);
      budget -= toEnrich.length;

      await this.runInChunks(toEnrich, AiService.ENRICH_CHUNK_SIZE, (u) =>
        this.enrichExistingUniversity(u, apiKey),
      );
    }

    // ── 2) Descubrir nuevas vía Places con el presupuesto restante ────────
    // Solo si de verdad hace falta MÁS cantidad — si ya hay suficientes en
    // BD, no tiene sentido gastar cuota de Places en encontrar más.
    if (needsMoreCoverage && apiKey && budget > 0) {
      await this.discoverNewNearby(lat, lng, radiusKm, apiKey, budget);
    }

    return this.getNearbyUniversities(lat, lng, radiusKm);
  }

  /** Corre `worker` sobre `items` en tandas paralelas de tamaño `size` (los errores ya los maneja cada worker). */
  private async runInChunks<T, R>(
    items: T[],
    size: number,
    worker: (item: T) => Promise<R>,
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = [];
    for (let i = 0; i < items.length; i += size) {
      results.push(
        ...(await Promise.allSettled(items.slice(i, i + size).map(worker))),
      );
    }
    return results;
  }

  /**
   * Enriquece UNA universidad existente sin programas: resuelve su website
   * (directo o vía Place Details con su googlePlaceId), lee el sitio real y
   * completa huecos con Groq — misma lógica y mismo prompt anti-alucinación
   * que el botón admin (enrichUniversitiesWithAi), aplicada a demanda a la
   * zona que el alumno está viendo. Registra aiEnrichedAt también en fallo
   * para no reintentar el mismo sitio muerto en cada visita.
   */
  private async enrichExistingUniversity(
    uni: University,
    apiKey?: string,
  ): Promise<void> {
    try {
      await this.enrichUniversityFromOfficialSite(uni, apiKey);
    } catch (err) {
      this.logger.warn(
        `Enriquecimiento de zona falló para "${uni.name}": ${err.message || err}`,
      );
      await this.markEnrichmentFailure(uni, err);
    }
  }

  /**
   * Única ruta de enriquecimiento para el flujo del alumno y el panel admin.
   * La oferta automática se REEMPLAZA por el conjunto que tenga evidencia
   * literal en las páginas oficiales; así también se limpian datos falsos de
   * corridas anteriores. Un catálogo curado por admin nunca se sobreescribe.
   */
  private async enrichUniversityFromOfficialSite(
    uni: University,
    apiKey?: string,
  ): Promise<{ changed: boolean; verifiedPrograms: number }> {
    let website: string | undefined = uni.website?.trim() || undefined;
    if (!website && !uni.googlePlaceId && apiKey && uni.location) {
      try {
        const placeId = await this.findPlaceId(
          apiKey,
          uni.name,
          uni.address,
          uni.location,
        );
        if (placeId) uni.googlePlaceId = placeId;
      } catch (err) {
        this.logger.warn(
          `findPlaceId falló para "${uni.name}": ${err.message || err}`,
        );
      }
    }
    if (!website && uni.googlePlaceId && apiKey) {
      website = await this.fetchPlaceWebsite(apiKey, uni.googlePlaceId);
      if (website) uni.website = website;
    }
    if (!website)
      throw new Error(
        'No se encontró un sitio oficial para verificar la oferta',
      );

    const url = website.startsWith('http') ? website : `http://${website}`;
    const pages = await this.fetchSitePages(url);
    const prompt = this.buildEnrichPrompt(
      uni.name,
      this.formatOfficialPagesForPrompt(pages),
    );
    const raw = await this.withTimeout(
      this.callGroqEnrich(prompt),
      this.ENRICH_GROQ_TIMEOUT_MS,
      'Groq (enriquecimiento de universidad)',
    );
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const verifiedPrograms = verifyProgramsAgainstOfficialPages(
      Array.isArray(parsed.steamPrograms) ? parsed.steamPrograms : [],
      pages,
      uni.name,
    );

    let changed = false;
    // La oferta curada a mano tiene precedencia. Cualquier catálogo generado
    // o legado sí se sustituye incluso por []: sin evidencia no se muestra.
    const hasCuratedAdminCatalog =
      !!uni.steamPrograms?.length &&
      (uni.programsVerificationSource === 'admin' || uni.source === 'manual');
    if (!hasCuratedAdminCatalog) {
      const previous = JSON.stringify(uni.steamPrograms || []);
      uni.steamPrograms = verifiedPrograms;
      uni.programsVerifiedAt = new Date();
      uni.programsVerificationSource =
        verifiedPrograms[0]?.sourceUrl || pages[0]?.url || url;
      changed = previous !== JSON.stringify(verifiedPrograms);
    } else if (
      !uni.programsVerifiedAt ||
      uni.programsVerificationSource !== 'admin'
    ) {
      uni.programsVerifiedAt = uni.programsVerifiedAt || new Date();
      uni.programsVerificationSource = 'admin';
      changed = true;
    }

    if (
      !uni.costTier &&
      ['public', 'affordable', 'private-premium'].includes(parsed.costTier)
    ) {
      uni.costTier = parsed.costTier;
      changed = true;
    }
    if (
      !uni.tuitionRange &&
      typeof parsed.tuitionRange === 'string' &&
      parsed.tuitionRange.trim()
    ) {
      uni.tuitionRange = parsed.tuitionRange.trim();
      changed = true;
    }
    if (
      !uni.modality &&
      typeof parsed.modality === 'string' &&
      parsed.modality.trim()
    ) {
      uni.modality = parsed.modality.trim();
      changed = true;
    }
    if (
      !uni.admissionDates &&
      typeof parsed.admissionDates === 'string' &&
      parsed.admissionDates.trim()
    ) {
      uni.admissionDates = parsed.admissionDates.trim();
      changed = true;
    }

    uni.aiEnrichedAt = new Date();
    uni.aiEnrichmentSource = url;
    const usableProgramCount = hasCuratedAdminCatalog
      ? recommendationPrograms(uni).length
      : verifiedPrograms.length;
    uni.aiEnrichmentStatus = usableProgramCount ? 'complete' : 'partial';
    uni.aiEnrichmentError = null;
    await this.universityRepository.save(uni);
    return { changed, verifiedPrograms: usableProgramCount };
  }

  private async markEnrichmentFailure(
    uni: University,
    error: unknown,
  ): Promise<void> {
    try {
      const message =
        error instanceof Error
          ? error.message
          : String(error || 'Error desconocido');
      uni.aiEnrichmentStatus = 'failed';
      uni.aiEnrichmentError = message.slice(0, 1000);
      // save() actualiza updatedAt; el orden por updatedAt hace que el
      // siguiente request avance a otras universidades antes de reintentar.
      await this.universityRepository.save(uni);
    } catch {
      /* si ni el diagnóstico se puede guardar, nada que hacer */
    }
  }

  /**
   * Descubre y valida universidades NUEVAS alrededor de una coordenada
   * (parte 2 de findOrDiscoverNearby): Places Nearby Search + dedupe
   * determinista por ubicación + clasificación/extracción con IA de los
   * `budget` candidatos más cercanos, en chunks paralelos.
   */
  private async discoverNewNearby(
    lat: number,
    lng: number,
    radiusKm: number,
    apiKey: string,
    budget: number,
  ): Promise<void> {
    const radiusMeters = Math.min(radiusKm, 50) * 1000;
    const seenPlaceIds = new Set<string>();
    const rawCandidates: any[] = [];

    for (const term of AiService.SEARCH_TERMS) {
      let results: any[] = [];
      try {
        results = await this.placesNearbySearch(
          apiKey,
          lat,
          lng,
          radiusMeters,
          term,
        );
      } catch (err) {
        this.logger.error(
          `Nearby discovery falló ("${term}"): ${err.message || err}`,
        );
        continue;
      }
      for (const place of results) {
        if (
          !place.place_id ||
          place.business_status === 'CLOSED_PERMANENTLY' ||
          this.isJunkName(place.name)
        ) {
          continue;
        }
        if (seenPlaceIds.has(place.place_id)) continue;
        seenPlaceIds.add(place.place_id);
        rawCandidates.push(place);
      }
    }
    if (!rawCandidates.length) return;

    // Dedupe determinista contra TODA la BD + contra el propio lote, por
    // ubicación física (<150m) — mismo criterio que discoverUniversities().
    const existing = await this.universityRepository.find({
      select: ['location'],
    });
    const locationIndex = this.buildLocationIndex(
      existing
        .map((u) => u.location)
        .filter((l): l is { latitude: number; longitude: number } => !!l),
    );

    const newCandidates: {
      place: any;
      loc: { latitude: number; longitude: number };
      distanceKm: number;
    }[] = [];
    for (const place of rawCandidates) {
      const loc =
        typeof place.geometry?.location?.lat === 'number' &&
        typeof place.geometry?.location?.lng === 'number'
          ? {
              latitude: place.geometry.location.lat,
              longitude: place.geometry.location.lng,
            }
          : undefined;
      if (!loc) continue;
      if (this.isNearIndexedLocation(locationIndex, loc)) continue; // ya existe en BD o ya visto en este lote
      this.addToLocationIndex(locationIndex, loc);
      newCandidates.push({
        place,
        loc,
        distanceKm: haversineKm(
          { lat, lng },
          { lat: loc.latitude, lng: loc.longitude },
        ),
      });
    }
    if (!newCandidates.length) return;

    // Presupuesto: solo los más cercanos se validan/enriquecen en esta visita.
    const toProcess = newCandidates
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, budget);

    const newRows: Partial<University>[] = [];
    await this.runInChunks(
      toProcess,
      AiService.ENRICH_CHUNK_SIZE,
      async ({ place, loc }) => {
        const row = await this.validateNewCandidate(place, loc, apiKey);
        if (row) newRows.push(row);
      },
    );

    // Los candidatos SIN website no pasaron por la validación completa (no
    // hay sitio que leer) — antes se guardaban directo como 'unverified' y
    // por ahí se colaban prepas/secundarias. Ahora una sola llamada barata a
    // la IA clasifica ese lote POR NOMBRE y descarta lo que claramente no es
    // educación superior.
    const withSite = newRows.filter((r) => r.website);
    const nameOnly = newRows.filter((r) => !r.website);
    let accepted = withSite;
    if (nameOnly.length) {
      const rejected = await this.classifyNonUniversitiesByName(
        nameOnly.map((r) => r.name!),
      );
      for (const r of nameOnly) {
        if (rejected.has(this.normalizeName(r.name!))) {
          await this.logAiDiscard(r.name!, 'name_classification');
        }
      }
      accepted = [
        ...withSite,
        ...nameOnly.filter((r) => !rejected.has(this.normalizeName(r.name!))),
      ];
    }

    if (accepted.length) {
      await this.bulkCreateUniversities(accepted);
    }
  }

  /**
   * Clasificación mínima POR NOMBRE (una sola llamada para todo el lote):
   * devuelve el conjunto de nombres (normalizados) que claramente NO son
   * educación superior. Conservadora a propósito — en caso de duda el
   * nombre NO se descarta (el filtro determinista de patrones ya atrapó los
   * casos obvios; esto es la segunda red para nombres ambiguos). Si Groq no
   * está disponible o falla, no se descarta nada.
   */
  private async classifyNonUniversitiesByName(
    names: string[],
  ): Promise<Set<string>> {
    if (!this.groq || !names.length) return new Set();
    const prompt = `SISTEMA:
Recibes nombres de lugares que Google Maps devolvió al buscar universidades en
México. Identifica cuáles claramente NO son instituciones de educación superior
(universidades, institutos tecnológicos, escuelas normales, centros
universitarios): por ejemplo preparatorias, secundarias, primarias, kinders,
academias de oficios sin nivel superior, oficinas, clínicas o negocios.

REGLA: si un nombre es ambiguo o podría ser educación superior, NO lo incluyas.
Solo incluye los que sin duda no lo son.

NOMBRES:
${JSON.stringify(names, null, 2)}

SALIDA (JSON estricto, sin texto extra):
{ "notHigherEducation": ["nombre exacto tal como lo recibiste", ...] }`;

    try {
      const raw = await this.withTimeout(
        this.callGroqEnrich(prompt),
        this.ENRICH_GROQ_TIMEOUT_MS,
        'Groq (clasificación por nombre)',
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      const list = Array.isArray(parsed?.notHigherEducation)
        ? parsed.notHigherEducation
        : [];
      return new Set(
        list
          .filter((n: any) => typeof n === 'string')
          .map((n: string) => this.normalizeName(n)),
      );
    } catch (err) {
      this.logger.warn(`Clasificación por nombre falló: ${err.message || err}`);
      return new Set();
    }
  }

  /**
   * Valida/clasifica UN candidato nuevo de Places con IA. Devuelve la fila
   * lista para persistir, o null si la IA lo clasificó como algo que no es
   * educación superior (se registra el descarte en ai_logs).
   */
  private async validateNewCandidate(
    place: any,
    loc: { latitude: number; longitude: number },
    apiKey: string,
  ): Promise<Partial<University> | null> {
    const base: Partial<University> = {
      name: place.name,
      location: loc,
      address: place.vicinity || place.formatted_address,
      rating: place.rating,
      googlePlaceId: place.place_id,
      source: 'nearby_ai_pipeline',
    };

    let website: string | undefined;
    try {
      website = await this.fetchPlaceWebsite(apiKey, place.place_id);
    } catch (err) {
      this.logger.warn(
        `Place Details falló para "${place.name}": ${err.message || err}`,
      );
    }

    if (!website || !this.groq) {
      // Sin sitio (o sin Groq configurado) no hay forma de validar/enriquecer:
      // se guarda igual, igual de honesto que el descubrimiento admin de hoy.
      return { ...base, institutionType: 'unverified' };
    }

    const url = website.startsWith('http') ? website : `http://${website}`;
    try {
      const pages = await this.fetchSitePages(url);
      const prompt = this.buildDiscoveryPrompt(
        place.name,
        this.formatOfficialPagesForPrompt(pages),
      );
      const raw = await this.withTimeout(
        this.callGroqEnrich(prompt),
        this.ENRICH_GROQ_TIMEOUT_MS,
        'Groq (descubrimiento cerca de ti)',
      );
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const institutionType =
        typeof parsed.institutionType === 'string'
          ? parsed.institutionType
          : 'unverified';

      if (DISCARDED_INSTITUTION_TYPES.has(institutionType)) {
        await this.logAiDiscard(place.name, institutionType);
        return null; // no es una institución de educación superior real: se descarta
      }

      const steamPrograms = verifyProgramsAgainstOfficialPages(
        Array.isArray(parsed.steamPrograms) ? parsed.steamPrograms : [],
        pages,
        place.name,
      );

      return {
        ...base,
        website: url,
        institutionType,
        steamPrograms: steamPrograms.length ? steamPrograms : undefined,
        costTier: ['public', 'affordable', 'private-premium'].includes(
          parsed.costTier,
        )
          ? parsed.costTier
          : undefined,
        tuitionRange:
          typeof parsed.tuitionRange === 'string' && parsed.tuitionRange.trim()
            ? parsed.tuitionRange.trim()
            : undefined,
        modality:
          typeof parsed.modality === 'string' && parsed.modality.trim()
            ? parsed.modality.trim()
            : undefined,
        admissionDates:
          typeof parsed.admissionDates === 'string' &&
          parsed.admissionDates.trim()
            ? parsed.admissionDates.trim()
            : undefined,
        programsVerifiedAt: new Date(),
        programsVerificationSource:
          steamPrograms[0]?.sourceUrl || pages[0]?.url || url,
        aiEnrichedAt: new Date(),
        aiEnrichmentSource: url,
        aiEnrichmentStatus: steamPrograms.length ? 'complete' : 'partial',
        aiEnrichmentError: null,
      };
    } catch (err) {
      this.logger.warn(
        `Descubrimiento con IA falló para "${place.name}": ${err.message || err}`,
      );
      // No se pudo confirmar con IA (sitio caído/timeout): se guarda igual
      // como "unverified" en vez de perder el candidato para siempre.
      return {
        ...base,
        website: url,
        institutionType: 'unverified',
        aiEnrichmentStatus: 'failed',
        aiEnrichmentError:
          err instanceof Error
            ? err.message.slice(0, 1000)
            : String(err).slice(0, 1000),
      };
    }
  }

  private async logAiDiscard(
    name: string,
    institutionType: string,
  ): Promise<void> {
    try {
      await this.aiLogRepository.save(
        this.aiLogRepository.create({
          studentName: name,
          detectedProfile: `descubrimiento cerca-de-ti: descartado (${institutionType})`,
          latency: 0,
          success: true,
          tokensConsumed: 0,
          provider: 'Groq',
        }),
      );
    } catch (err) {
      this.logger.error('Error guardando log de descarte', err);
    }
  }

  async createUniversity(data: Partial<University>): Promise<University> {
    const university = this.universityRepository.create({
      ...data,
      source: data.source || 'manual',
      ...(data.steamPrograms
        ? {
            programsVerifiedAt: new Date(),
            programsVerificationSource: 'admin',
          }
        : {}),
    });
    return this.universityRepository.save(university);
  }

  async updateUniversity(
    id: string,
    data: Partial<University>,
  ): Promise<University | null> {
    await this.universityRepository.update(id, {
      ...data,
      ...(data.steamPrograms !== undefined
        ? {
            programsVerifiedAt: new Date(),
            programsVerificationSource: 'admin',
          }
        : {}),
    });
    return this.universityRepository.findOne({ where: { id } });
  }

  async deleteUniversity(id: string): Promise<void> {
    await this.universityRepository.delete(id);
  }

  /** Borra TODAS las universidades — para reiniciar el mapeo desde cero. */
  async deleteAllUniversities(): Promise<{ deleted: number }> {
    const { affected } = await this.universityRepository
      .createQueryBuilder()
      .delete()
      .execute();
    return { deleted: affected ?? 0 };
  }

  /**
   * Radio de limpieza RETROACTIVA de duplicados (300m) — más generoso que
   * el de ingesta (SAME_PLACE_RADIUS_KM, 150m). Existen porque el índice de
   * "ya existe" al descubrir solo ve lo guardado ANTES de esa corrida: dos
   * corridas separadas (ej. Places y luego DENUE, o el mismo estado dos
   * veces) pueden guardar el mismo lugar dos veces si el geocoding varía
   * más de 150m entre fuentes. Aquí sí se agrupa por NOMBRE (no solo
   * ubicación), porque el objetivo es fusionar registros que ya sabemos que
   * son la misma institución por su nombre.
   */
  private static readonly DUPLICATE_CLEANUP_RADIUS_KM = 0.3;

  /** Qué tan completa está una ficha — al fusionar duplicados se conserva la de mayor puntaje. */
  private completenessScore(u: University): number {
    let score = 0;
    if (u.costTier) score++;
    if (u.tuitionRange) score++;
    if (u.rating != null) score++;
    if (u.modality) score++;
    if (u.website) score++;
    score += (u.steamPrograms?.length || 0) * 2; // los programas son lo que activa el matching de A8
    return score;
  }

  /**
   * Limpieza retroactiva sobre lo YA GUARDADO, en dos pasadas:
   * 1) Nombres basura (JUNK_NAME_PATTERNS) — oficinas de gobierno,
   *    sindicatos, estacionamientos, etc. que se colaron en corridas
   *    anteriores.
   * 2) Duplicados: mismo nombre normalizado a <300m — se conserva la ficha
   *    más completa (con programas/costo ya llenados) y se borran las
   *    demás del mismo cluster.
   */
  async cleanupJunkUniversities(): Promise<{
    deleted: number;
    deletedNames: string[];
  }> {
    const all = await this.universityRepository.find();
    const toDelete = new Set<string>();
    const deletedNames: string[] = [];

    for (const u of all) {
      if (this.isJunkName(u.name)) {
        toDelete.add(u.id);
        deletedNames.push(u.name);
      }
    }

    const survivors = all.filter((u) => !toDelete.has(u.id) && u.location);
    const byName = new Map<string, University[]>();
    for (const u of survivors) {
      const key = this.normalizeName(u.name);
      const list = byName.get(key) ?? [];
      list.push(u);
      byName.set(key, list);
    }

    for (const group of byName.values()) {
      if (group.length < 2) continue;
      // Clustering simple por cercanía dentro del mismo nombre: une cualquier
      // par a <300m (encadenado), sin tocar campus realmente distintos y lejanos.
      const clusters: University[][] = [];
      for (const u of group) {
        const cluster = clusters.find((c) =>
          c.some(
            (member) =>
              haversineKm(
                {
                  lat: member.location.latitude,
                  lng: member.location.longitude,
                },
                { lat: u.location.latitude, lng: u.location.longitude },
              ) < AiService.DUPLICATE_CLEANUP_RADIUS_KM,
          ),
        );
        if (cluster) cluster.push(u);
        else clusters.push([u]);
      }

      for (const cluster of clusters) {
        if (cluster.length < 2) continue;
        const [, ...remove] = [...cluster].sort(
          (a, b) => this.completenessScore(b) - this.completenessScore(a),
        );
        for (const u of remove) {
          toDelete.add(u.id);
          deletedNames.push(u.name);
        }
      }
    }

    if (!toDelete.size) return { deleted: 0, deletedNames: [] };
    await this.universityRepository.delete([...toDelete]);
    return { deleted: toDelete.size, deletedNames };
  }

  /**
   * Carga masiva (CSV/JSON) desde el panel admin. Cada fila se valida y
   * guarda por separado: una fila inválida no debe tirar el lote completo.
   * `name` + `location` (lat/lng) son obligatorios porque sin ellos A8 los
   * excluye de cualquier forma (ver university-match.service.ts).
   */
  async bulkCreateUniversities(rows: Partial<University>[]): Promise<{
    created: number;
    failed: number;
    errors: { index: number; name?: string; error: string }[];
  }> {
    const errors: { index: number; name?: string; error: string }[] = [];
    let created = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const name = typeof row?.name === 'string' ? row.name.trim() : '';
      const lat = row?.location?.latitude;
      const lng = row?.location?.longitude;

      if (!name) {
        errors.push({ index, error: 'Falta el campo "name"' });
        continue;
      }
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        errors.push({
          index,
          name,
          error:
            'Falta location.latitude/longitude (obligatorio para el matching)',
        });
        continue;
      }

      try {
        const university = this.universityRepository.create({
          ...row,
          name,
          location: { latitude: lat, longitude: lng },
          ...(row.steamPrograms?.length && !row.programsVerifiedAt
            ? {
                programsVerifiedAt: new Date(),
                programsVerificationSource: 'admin',
              }
            : {}),
        });
        await this.universityRepository.save(university);
        created++;
      } catch (err) {
        errors.push({ index, name, error: err.message || String(err) });
      }
    }

    return { created, failed: errors.length, errors };
  }

  /**
   * Exporta universidades (con `id`) para editar a mano y reimportar con
   * bulkUpdateUniversities(). `filter` (opcional): texto en nombre/
   * dirección — mismo criterio normalizado que el resto del módulo, para
   * exportar por zona/estado en vez de las ~7,000 de un jalón.
   */
  async exportUniversities(filter?: string): Promise<University[]> {
    const all = await this.universityRepository.find({
      order: { createdAt: 'ASC' },
    });
    if (!filter) return all;
    const wanted = this.normalizeName(filter);
    return all.filter(
      (u) =>
        this.normalizeName(u.name).includes(wanted) ||
        this.normalizeName(u.address || '').includes(wanted),
    );
  }

  /**
   * Contraparte de exportUniversities(): actualiza registros EXISTENTES por
   * `id` (a diferencia de bulkCreateUniversities, que solo crea). Pensado
   * para el flujo "exportar JSON → llenar a mano → reimportar" — la fuente
   * más confiable posible, porque no depende de que la IA adivine nada.
   * Sobreescribe con lo que venga en cada fila (igual que editar una por
   * una en el panel); una fila sin `id` o con `id` inexistente se reporta
   * como error, no crea nada nuevo (para eso ya existe bulk-import).
   */
  async bulkUpdateUniversities(rows: Partial<University>[]): Promise<{
    updated: number;
    failed: number;
    errors: { index: number; name?: string; error: string }[];
  }> {
    const errors: { index: number; name?: string; error: string }[] = [];
    let updated = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const id = (row as any)?.id;
      const name = typeof row?.name === 'string' ? row.name.trim() : undefined;

      if (!id || typeof id !== 'string') {
        errors.push({
          index,
          name,
          error: 'Falta "id" (usa el export, no edites/borres ese campo)',
        });
        continue;
      }
      try {
        const existing = await this.universityRepository.findOne({
          where: { id },
        });
        if (!existing) {
          errors.push({
            index,
            name,
            error: `No existe una universidad con id "${id}"`,
          });
          continue;
        }
        const { id: _ignored, createdAt, updatedAt, ...fields } = row as any;
        await this.universityRepository.update(id, {
          ...fields,
          ...(row.steamPrograms !== undefined
            ? {
                programsVerifiedAt: new Date(),
                programsVerificationSource: 'admin',
              }
            : {}),
        });
        updated++;
      } catch (err) {
        errors.push({ index, name, error: err.message || String(err) });
      }
    }

    return { updated, failed: errors.length, errors };
  }

  /**
   * Capitales de los 32 estados + algunas zonas metropolitanas grandes con
   * alta densidad de universidades que no son la capital administrativa.
   * Mismo criterio que scripts/discover-universities.js, pero limitado a
   * UNA página por ciudad (sin paginación) para que el botón del admin
   * responda en segundos y no en minutos.
   */
  private static readonly DISCOVERY_CITIES: [string, string][] = [
    ['Aguascalientes', 'Aguascalientes'],
    ['Mexicali', 'Baja California'],
    ['Tijuana', 'Baja California'],
    ['La Paz', 'Baja California Sur'],
    ['Campeche', 'Campeche'],
    ['Saltillo', 'Coahuila'],
    ['Torreón', 'Coahuila'],
    ['Colima', 'Colima'],
    ['Tuxtla Gutiérrez', 'Chiapas'],
    ['Chihuahua', 'Chihuahua'],
    ['Ciudad Juárez', 'Chihuahua'],
    ['Ciudad de México', 'CDMX'],
    ['Durango', 'Durango'],
    ['León', 'Guanajuato'],
    ['Guanajuato', 'Guanajuato'],
    ['Chilpancingo', 'Guerrero'],
    ['Acapulco', 'Guerrero'],
    ['Pachuca', 'Hidalgo'],
    ['Guadalajara', 'Jalisco'],
    ['Zapopan', 'Jalisco'],
    ['Toluca', 'Estado de México'],
    ['Naucalpan', 'Estado de México'],
    ['Morelia', 'Michoacán'],
    ['Cuernavaca', 'Morelos'],
    ['Tepic', 'Nayarit'],
    ['Monterrey', 'Nuevo León'],
    ['San Nicolás de los Garza', 'Nuevo León'],
    ['Oaxaca de Juárez', 'Oaxaca'],
    ['Puebla', 'Puebla'],
    ['Cholula', 'Puebla'],
    ['Querétaro', 'Querétaro'],
    ['Chetumal', 'Quintana Roo'],
    ['Cancún', 'Quintana Roo'],
    ['San Luis Potosí', 'San Luis Potosí'],
    ['Culiacán', 'Sinaloa'],
    ['Hermosillo', 'Sonora'],
    ['Villahermosa', 'Tabasco'],
    ['Ciudad Victoria', 'Tamaulipas'],
    ['Tampico', 'Tamaulipas'],
    ['Tlaxcala', 'Tlaxcala'],
    ['Xalapa', 'Veracruz'],
    ['Veracruz', 'Veracruz'],
    ['Mérida', 'Yucatán'],
    ['Zacatecas', 'Zacatecas'],
  ];

  /** Código de entidad INEGI (01-32) por nombre de estado — mismos 32 nombres que DISCOVERY_CITIES. */
  private static readonly INEGI_STATE_CODES: Record<string, string> = {
    Aguascalientes: '01',
    'Baja California': '02',
    'Baja California Sur': '03',
    Campeche: '04',
    Coahuila: '05',
    Colima: '06',
    Chiapas: '07',
    Chihuahua: '08',
    CDMX: '09',
    Durango: '10',
    Guanajuato: '11',
    Guerrero: '12',
    Hidalgo: '13',
    Jalisco: '14',
    'Estado de México': '15',
    Michoacán: '16',
    Morelos: '17',
    Nayarit: '18',
    'Nuevo León': '19',
    Oaxaca: '20',
    Puebla: '21',
    Querétaro: '22',
    'Quintana Roo': '23',
    'San Luis Potosí': '24',
    Sinaloa: '25',
    Sonora: '26',
    Tabasco: '27',
    Tamaulipas: '28',
    Tlaxcala: '29',
    Veracruz: '30',
    Yucatán: '31',
    Zacatecas: '32',
  };

  private normalizeName(name: string): string {
    return (name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  /**
   * Nombres que NO deben tratarse como universidades: basura administrativa
   * (oficinas, sindicatos, estacionamientos) Y escuelas de nivel básico/medio
   * (preparatorias, secundarias, CONALEP, etc.). Patrones compartidos en
   * institution-filter.ts. Se usa para filtrar candidatos nuevos en los tres
   * descubrimientos y para limpiar lo ya guardado (cleanupJunkUniversities()).
   */
  private isJunkName(name: string): boolean {
    return isExcludedInstitutionName(name);
  }

  /**
   * Índice espacial simple (grid de ~110m) para detectar "misma ubicación
   * física" SIN depender del nombre — dos registros con nombres distintos
   * (ej. razón social vs. marca comercial) en el mismo edificio deben
   * contarse como el mismo campus; dos registros con el MISMO nombre en
   * ciudades distintas NO deben colapsarse. Las coordenadas son la fuente
   * de verdad, el nombre ya no participa en la decisión.
   */
  private static readonly SAME_PLACE_RADIUS_KM = 0.15; // ~150m

  private buildLocationIndex(
    locations: { latitude: number; longitude: number }[],
  ): Map<string, { latitude: number; longitude: number }[]> {
    const index = new Map<string, { latitude: number; longitude: number }[]>();
    const cellKey = (lat: number, lng: number) =>
      `${Math.round(lat * 1000)},${Math.round(lng * 1000)}`;
    for (const loc of locations) {
      const key = cellKey(loc.latitude, loc.longitude);
      const list = index.get(key) ?? [];
      list.push(loc);
      index.set(key, list);
    }
    return index;
  }

  private addToLocationIndex(
    index: Map<string, { latitude: number; longitude: number }[]>,
    loc: { latitude: number; longitude: number },
  ): void {
    const key = `${Math.round(loc.latitude * 1000)},${Math.round(loc.longitude * 1000)}`;
    const list = index.get(key) ?? [];
    list.push(loc);
    index.set(key, list);
  }

  /** true si `loc` cae a <150m de alguna ubicación ya indexada (revisa la celda propia + las 8 vecinas). */
  private isNearIndexedLocation(
    index: Map<string, { latitude: number; longitude: number }[]>,
    loc: { latitude: number; longitude: number },
  ): boolean {
    const cellLat = Math.round(loc.latitude * 1000);
    const cellLng = Math.round(loc.longitude * 1000);
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const candidates = index.get(`${cellLat + dLat},${cellLng + dLng}`);
        if (!candidates) continue;
        for (const c of candidates) {
          if (
            haversineKm(
              { lat: c.latitude, lng: c.longitude },
              { lat: loc.latitude, lng: loc.longitude },
            ) < AiService.SAME_PLACE_RADIUS_KM
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** Términos de búsqueda: "universidad" no cubre Institutos Tecnológicos, Escuelas Superiores del IPN, etc. */
  private static readonly SEARCH_TERMS = [
    'universidad',
    'instituto tecnológico',
    'centro universitario',
    'escuela superior',
  ];

  private readonly sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * `maxPages`: cuántas páginas (20 resultados c/u) seguir vía
   * next_page_token. 1 = rápido (usado en corridas de todo el país); hasta
   * 3 = más profundo (usado cuando se filtra a un solo estado), ya que
   * Google exige ~2s de espera entre páginas.
   */
  private async placesTextSearch(
    apiKey: string,
    query: string,
    maxPages: number,
  ): Promise<any[]> {
    const results: any[] = [];
    let pagetoken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const url = new URL(
        'https://maps.googleapis.com/maps/api/place/textsearch/json',
      );
      url.searchParams.set('key', apiKey);
      if (pagetoken) {
        url.searchParams.set('pagetoken', pagetoken);
      } else {
        url.searchParams.set('query', query);
        url.searchParams.set('language', 'es');
        url.searchParams.set('region', 'mx');
      }
      const res = await fetch(url.toString());
      const data: any = await res.json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        this.logger.warn(
          `Places API "${data.status}" para "${query}": ${data.error_message || ''}`,
        );
      }
      results.push(...(data.results || []));
      pagetoken = data.next_page_token;
      if (!pagetoken) break;
      await this.sleep(2200); // el next_page_token tarda en activarse
    }
    return results;
  }

  /**
   * Google Places Nearby Search (server-side, la key nunca se expone al
   * cliente) alrededor de una coordenada — usado por findOrDiscoverNearby()
   * para "cerca de ti". A diferencia de placesTextSearch() (por texto libre,
   * pensado para barridos por ciudad), este busca por `location`+`radius`,
   * que es lo que de verdad importa para una visita real de un usuario.
   * Una sola página (hasta 20 resultados) por término: alcanza de sobra para
   * un radio de búsqueda normal y evita la espera de ~2s/página que sí vale
   * la pena en los barridos masivos del admin, no aquí.
   */
  private async placesNearbySearch(
    apiKey: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    keyword: string,
  ): Promise<any[]> {
    const url = new URL(
      'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', String(Math.min(radiusMeters, 50000)));
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('language', 'es');
    const res = await fetch(url.toString());
    const data: any = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      this.logger.warn(
        `Places Nearby "${data.status}" para "${keyword}": ${data.error_message || ''}`,
      );
    }
    return data.results || [];
  }

  /** Place Details (solo el campo `website`) — Nearby/Text Search no lo incluyen. */
  private async fetchPlaceWebsite(
    apiKey: string,
    placeId: string,
  ): Promise<string | undefined> {
    const url = new URL(
      'https://maps.googleapis.com/maps/api/place/details/json',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'website');
    const res = await fetch(url.toString());
    const data: any = await res.json();
    return data?.result?.website || undefined;
  }

  /**
   * Resuelve el place_id de una universidad YA GUARDADA que no lo tiene
   * (típico de descubrimientos viejos: botón admin de Places, DENUE) —
   * Find Place From Text, sesgado por la ubicación real de la universidad
   * para no confundirla con un campus homónimo en otra ciudad. Sin esto,
   * enrichExistingUniversity() no tenía forma de pedir el website de esos
   * registros y quedaban "vacíos" para siempre.
   */
  private async findPlaceId(
    apiKey: string,
    name: string,
    address: string | undefined,
    loc: { latitude: number; longitude: number },
  ): Promise<string | undefined> {
    const query = [name, address].filter(Boolean).join(', ');
    const url = new URL(
      'https://maps.googleapis.com/maps/api/place/findplacefromtext/json',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('input', query);
    url.searchParams.set('inputtype', 'textquery');
    url.searchParams.set('fields', 'place_id');
    url.searchParams.set(
      'locationbias',
      `circle:2000@${loc.latitude},${loc.longitude}`,
    );
    const res = await fetch(url.toString());
    const data: any = await res.json();
    return data?.candidates?.[0]?.place_id || undefined;
  }

  /**
   * Descubrimiento automático de universidades (Google Places Text Search)
   * disparado desde el botón del panel admin. Busca varios términos
   * (universidad / instituto tecnológico / centro universitario / escuela
   * superior) en las capitales estatales + zonas metropolitanas grandes,
   * de-duplica contra resultados repetidos y contra lo que ya existe en BD
   * — por nombre Y ubicación cercana (<5km), para no descartar campus
   * distintos de una misma red (UVM, Tec Milenio, etc. tienen el mismo
   * nombre en decenas de ciudades) — y guarda las nuevas.
   *
   * NO llena steamPrograms/costTier/tuitionRange/modality: eso requiere
   * curación manual por institución (no se inventan datos de programas).
   */
  async discoverUniversities(states?: string[]): Promise<{
    totalFound: number;
    created: number;
    skippedExisting: number;
    failed: number;
    errors: { index: number; name?: string; error: string }[];
  }> {
    const apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      throw new Error(
        'GOOGLE_PLACES_API_KEY no está configurada en el servidor.',
      );
    }

    const wantedStates = states?.length
      ? new Set(states.map((s) => this.normalizeName(s)))
      : null;
    const cities = wantedStates
      ? AiService.DISCOVERY_CITIES.filter(([, state]) =>
          wantedStates.has(this.normalizeName(state)),
        )
      : AiService.DISCOVERY_CITIES;
    if (wantedStates && !cities.length) {
      throw new Error(
        `Ningún estado coincide con: ${states!.join(', ')}. Revisa el nombre exacto (ej. "Jalisco", "CDMX", "Estado de México").`,
      );
    }
    // Buceo profundo (3 páginas) solo si se acotó a estado(s) puntuales;
    // "todo el país" se queda en 1 página por término para no tardar minutos.
    const maxPages = wantedStates ? 3 : 1;

    const existing = await this.universityRepository.find({
      select: ['location'],
    });
    const locationIndex = this.buildLocationIndex(
      existing
        .map((u) => u.location)
        .filter((l): l is { latitude: number; longitude: number } => !!l),
    );

    const seenPlaceIds = new Set<string>();
    const newRows: Partial<University>[] = [];
    let totalFound = 0;
    let skippedExisting = 0;

    for (const [city, state] of cities) {
      for (const term of AiService.SEARCH_TERMS) {
        let results: any[] = [];
        try {
          results = await this.placesTextSearch(
            apiKey,
            `${term} en ${city}, ${state}, México`,
            maxPages,
          );
        } catch (err) {
          this.logger.error(
            `Descubrimiento falló en ${city}, ${state} ("${term}"): ${err.message || err}`,
          );
          continue;
        }

        for (const place of results) {
          if (
            !place.place_id ||
            place.business_status === 'CLOSED_PERMANENTLY' ||
            this.isJunkName(place.name)
          ) {
            continue;
          }
          totalFound++;
          if (seenPlaceIds.has(place.place_id)) continue;
          seenPlaceIds.add(place.place_id);

          const loc =
            typeof place.geometry?.location?.lat === 'number' &&
            typeof place.geometry?.location?.lng === 'number'
              ? {
                  latitude: place.geometry.location.lat,
                  longitude: place.geometry.location.lng,
                }
              : undefined;

          // Duplicado = misma UBICACIÓN física (<150m), sin importar el
          // nombre: la misma institución a veces se registra con nombres
          // distintos (razón social vs. marca comercial).
          if (loc && this.isNearIndexedLocation(locationIndex, loc)) {
            skippedExisting++;
            continue;
          }
          if (loc) this.addToLocationIndex(locationIndex, loc);

          newRows.push({
            name: place.name,
            location: loc,
            address: place.formatted_address,
            rating: place.rating,
          });
        }
      }
    }

    const result = await this.bulkCreateUniversities(newRows);
    return { totalFound, skippedExisting, ...result };
  }

  /**
   * Página de resultados del DENUE (INEGI) para el SCIAN 6113 "Escuelas de
   * educación superior" (611311 público / 611312 privado) en un estado.
   * `start`/`end` son 1-indexados, tramo inclusive (ej. 1-300).
   */
  private async denueFetchPage(
    token: string,
    entidad: string,
    start: number,
    end: number,
  ): Promise<any[]> {
    const url =
      `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarAreaAct/` +
      `${entidad}/0/0/0/0/61/611/6113/0/0/${start}/${end}/0/${token}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`DENUE respondió HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      // La API del DENUE responde texto plano (no JSON) en varios casos de
      // error (token inválido, parámetros mal formados, etc.).
      throw new Error(
        typeof data === 'string' ? data : 'Respuesta inesperada del DENUE',
      );
    }
    return data;
  }

  /**
   * Descubrimiento vía DENUE (INEGI) — censo económico oficial, filtrado por
   * el SCIAN exacto de educación superior (no depende de palabras clave).
   * Requiere `states` (a diferencia del descubrimiento por Google Places):
   * un solo estado puede traer cientos de registros, así que correr los 32
   * de un jalón en una sola petición HTTP arriesgaría timeout.
   *
   * DENUE registra cada plantel/facultad como una "unidad económica"
   * separada (ej. UNAM aparece decenas de veces: una por facultad). Se usa
   * `Nombre` (el plantel específico) como nombre, NO `Razon_social` (la
   * dependencia dueña): para escuelas federales (Institutos Tecnológicos,
   * Normales) la razón social suele ser genérica ("SECRETARIA DE EDUCACION
   * PUBLICA", "TECNOLOGICO NACIONAL DE MEXICO"), compartida por decenas de
   * planteles totalmente distintos en el mismo estado — usarla como nombre
   * los volvía indistinguibles entre sí y, peor, los excluía por completo
   * al coincidir con el filtro de nombres basura (JUNK_NAME_PATTERNS
   * bloquea la dependencia "SECRETARIA DE EDUCACION PUBLICA" a secas, no
   * el plantel real). La deduplicación ya es por ubicación física (<150m,
   * ver isNearIndexedLocation), no por nombre, así que no hay necesidad de
   * colapsar por razón social: planteles a >150m siempre se guardan aparte.
   */
  async discoverFromDenue(states: string[]): Promise<{
    totalFound: number;
    created: number;
    skippedExisting: number;
    failed: number;
    errors: { index: number; name?: string; error: string }[];
  }> {
    const token = this.configService.get<string>('INEGI_DENUE_TOKEN');
    if (!token) {
      throw new Error('INEGI_DENUE_TOKEN no está configurada en el servidor.');
    }
    if (!states?.length) {
      throw new Error(
        'El descubrimiento por DENUE requiere elegir un estado (puede traer cientos de registros por estado).',
      );
    }

    const entityCodes = states
      .map((s) => AiService.INEGI_STATE_CODES[s])
      .filter((code): code is string => !!code);
    if (!entityCodes.length) {
      throw new Error(
        `Ningún estado coincide con: ${states.join(', ')}. Revisa el nombre exacto (ej. "Jalisco", "CDMX", "Estado de México").`,
      );
    }

    const existing = await this.universityRepository.find({
      select: ['location'],
    });
    const locationIndex = this.buildLocationIndex(
      existing
        .map((u) => u.location)
        .filter((l): l is { latitude: number; longitude: number } => !!l),
    );

    const PAGE_SIZE = 300;
    const MAX_PER_STATE = 3000; // salvaguarda: ningún estado debería tener más
    const newRows: Partial<University>[] = [];
    let totalFound = 0;
    let skippedExisting = 0;

    for (const entidad of entityCodes) {
      let start = 1;
      while (start <= MAX_PER_STATE) {
        const end = start + PAGE_SIZE - 1;
        let page: any[] = [];
        try {
          page = await this.denueFetchPage(token, entidad, start, end);
        } catch (err) {
          this.logger.error(
            `DENUE falló para entidad ${entidad} (${start}-${end}): ${err.message || err}`,
          );
          break;
        }
        if (!page.length) break;

        for (const row of page) {
          const nombre = (row.Nombre || row.Razon_social || '').trim();
          if (!nombre || this.isJunkName(nombre)) continue;

          const lat = parseFloat(row.Latitud);
          const lng = parseFloat(row.Longitud);
          const loc =
            Number.isFinite(lat) && Number.isFinite(lng)
              ? { latitude: lat, longitude: lng }
              : undefined;

          totalFound++;

          // Duplicado = misma UBICACIÓN física (<150m), sin importar el
          // nombre: DENUE registra cada facultad/departamento por separado
          // y a veces con razón social distinta a la marca comercial.
          if (loc && this.isNearIndexedLocation(locationIndex, loc)) {
            skippedExisting++;
            continue;
          }
          if (loc) this.addToLocationIndex(locationIndex, loc);

          newRows.push({
            name: nombre,
            location: loc,
            address:
              [row.Tipo_vialidad, row.Calle, row.Num_Exterior, row.Colonia]
                .filter(Boolean)
                .join(' ') || undefined,
            website: row.Sitio_internet
              ? row.Sitio_internet.toLowerCase().startsWith('http')
                ? row.Sitio_internet.toLowerCase()
                : `http://${row.Sitio_internet.toLowerCase()}`
              : undefined,
          });
        }

        if (page.length < PAGE_SIZE) break; // última página
        start += PAGE_SIZE;
      }
    }

    const result = await this.bulkCreateUniversities(newRows);
    return { totalFound, skippedExisting, ...result };
  }

  // ==========================================================================
  //  ENRIQUECIMIENTO CON IA (Groq) — completa steamPrograms/costTier/
  //  tuitionRange/modality faltantes leyendo el sitio oficial real.
  // ==========================================================================

  private readonly ENRICH_FETCH_TIMEOUT_MS = 8_000;
  private readonly ENRICH_SUBPAGE_TIMEOUT_MS = 5_000;
  private readonly ENRICH_GROQ_TIMEOUT_MS = 12_000;

  private decodeHtmlEntities(value: string): string {
    const named: Record<string, string> = {
      nbsp: ' ',
      amp: '&',
      quot: '"',
      apos: "'",
      lt: '<',
      gt: '>',
      aacute: 'á',
      eacute: 'é',
      iacute: 'í',
      oacute: 'ó',
      uacute: 'ú',
      Aacute: 'Á',
      Eacute: 'É',
      Iacute: 'Í',
      Oacute: 'Ó',
      Uacute: 'Ú',
      ntilde: 'ñ',
      Ntilde: 'Ñ',
      uuml: 'ü',
      Uuml: 'Ü',
    };
    return value
      .replace(/&([A-Za-z]+);/g, (full, name: string) => named[name] ?? full)
      .replace(/&#(\d+);/g, (_full, code: string) =>
        String.fromCodePoint(Number(code)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_full, code: string) =>
        String.fromCodePoint(parseInt(code, 16)),
      );
  }

  /** Descarga una página y devuelve su HTML crudo + el texto plano limpio. */
  private async fetchPage(
    url: string,
    timeoutMs: number,
  ): Promise<{ url: string; html: string; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        // Un User-Agent que se auto-declara "bot" hace que varios WAFs de
        // universidades (Cloudflare, Sucuri, etc.) bloqueen o desafíen la
        // petición sin siquiera responder — en la práctica eso dejaba sin
        // poder leerse una buena parte de los sitios reales. Se cambia a un
        // navegador estándar (mismo tipo de acceso que haría cualquier
        // visitante o el propio Googlebot al indexar la página pública).
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-MX,es;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const text = this.decodeHtmlEntities(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
      return { url: res.url || url, html, text };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Extrae de la portada hasta 2 enlaces internos que apunten a oferta
   * educativa / carreras / costos — las páginas donde de verdad vive la
   * info que la portada casi nunca trae.
   */
  private extractCandidateLinks(html: string, baseUrl: string): string[] {
    // Primero índices completos de oferta/licenciaturas; después fichas de
    // carreras y páginas de admisión/costos. Se revisa TODO el HTML: el límite
    // anterior de 12 enlaces dejaba fuera la oferta STEAM cuando el menú
    // listaba primero administración, derecho o humanidades.
    const INDEX =
      /oferta[\s_/-]*(academica|educativa)|licenciaturas?|ingenierias?|carreras?|programas?[\s_/-]*(academicos|educativos)/i;
    const DEGREE =
      /licenciatur|ingenier|arquitect|actuari|biolog|fisic|quimic|matematic|comput|software|sistemas|tecnolog|dise[nñ]|artes?|musica/i;
    const INFO = /colegiatura|costo|admisi|inscripci|convocatoria/i;
    const EXCLUDE =
      /maestr|doctor|posgrado|diplomado|curso|blog|noticia|wp-content|\.pdf(?:$|\?)/i;
    const found: { url: string; score: number }[] = [];
    const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      const label = m[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const sample = `${href} ${label}`;
      if (EXCLUDE.test(sample)) continue;
      const score = INDEX.test(sample)
        ? 12
        : DEGREE.test(sample)
          ? 8
          : INFO.test(sample)
            ? 3
            : 0;
      if (!score) continue;
      try {
        const abs = new URL(href, baseUrl);
        if (!/^https?:$/.test(abs.protocol)) continue;
        const host = (value: string) =>
          value.toLowerCase().replace(/^www\./, '');
        if (host(abs.hostname) !== host(new URL(baseUrl).hostname)) continue;
        abs.hash = '';
        const clean = abs.toString();
        const existing = found.find((f) => f.url === clean);
        if (existing) existing.score = Math.max(existing.score, score);
        else found.push({ url: clean, score });
      } catch {
        /* href inválido: se ignora */
      }
    }
    // Seis subpáginas mantienen el request acotado y se descargan en paralelo.
    return found
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((f) => f.url);
  }

  /**
   * Texto del sitio para la IA: portada + hasta 2 subpáginas relevantes
   * (oferta educativa/costos), descargadas en paralelo. La IA sigue
   * limitada a extraer SOLO de este texto — se amplía el terreno leído,
   * no el permiso de inventar.
   */
  private async fetchSitePages(url: string): Promise<OfficialSitePage[]> {
    const home = await this.fetchPage(url, this.ENRICH_FETCH_TIMEOUT_MS);
    if (home.text.length < 50 && !home.html) {
      throw new Error('La página no devolvió contenido');
    }
    const pages: OfficialSitePage[] = [
      { url: home.url, text: home.text.slice(0, 20_000) },
    ];

    const subLinks = this.extractCandidateLinks(home.html, home.url);
    if (subLinks.length) {
      const subs = await Promise.allSettled(
        subLinks.map((link) =>
          this.fetchPage(link, this.ENRICH_SUBPAGE_TIMEOUT_MS),
        ),
      );
      subs.forEach((s) => {
        if (s.status === 'fulfilled' && s.value.text.length >= 50) {
          pages.push({ url: s.value.url, text: s.value.text.slice(0, 8_000) });
        }
      });
    }

    if (!pages.some((page) => page.text.trim().length >= 50)) {
      throw new Error(
        'La página no devolvió suficiente texto (¿SPA sin contenido server-rendered?)',
      );
    }
    return pages;
  }

  private formatOfficialPagesForPrompt(pages: OfficialSitePage[]): string {
    return pages
      .map((page, index) => {
        // La evidencia completa permanece en `pages` para la validación
        // literal posterior. Al modelo se le manda un extracto acotado para
        // que tres universidades puedan procesarse en paralelo sin rebasar
        // el límite de tokens por minuto de Groq.
        const budget = index === 0 ? 5_000 : 800;
        return `[FUENTE OFICIAL: ${page.url}]\n${page.text.slice(0, budget)}`;
      })
      .join('\n\n');
  }

  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout de ${ms}ms en ${label}`)),
        ms,
      );
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  private buildEnrichPrompt(universityName: string, siteText: string): string {
    return `SISTEMA:
Eres un asistente que extrae datos EXPLÍCITOS de una página web oficial de una
universidad mexicana. NUNCA inventes ni completes con conocimiento externo o
suposiciones — solo reporta lo que esté literalmente en el texto dado.

REGLAS ESTRICTAS:
1. Si un dato no aparece explícitamente en el texto, devuélvelo vacío/null.
   NO asumas, NO generalices a partir del nombre de la universidad.
2. "steamPrograms": solo CARRERAS INDIVIDUALES específicas (licenciatura,
   ingeniería, técnico superior) de las áreas Ciencia, Tecnología, Ingeniería,
   Artes o Matemáticas que el texto mencione literalmente.
   "area" debe ser una de: ciencia | tecnologia | ingenieria | artes | matematicas.
   NUNCA reportes como "programa" el nombre de una DIVISIÓN ACADÉMICA, CENTRO
   UNIVERSITARIO, FACULTAD o ÁREA GENERAL (ej. "Centro Universitario de
   Ciencias de la Salud", "Humanidades", "Ciencias Biológicas y Agropecuarias",
   "División de Ingenierías") — esos son agrupaciones administrativas, no una
   carrera. Ejemplo correcto: "Ingeniería en Software" (SÍ es una carrera).
   Ejemplo incorrecto: "Ciencias de la Salud" (NO es una carrera, es una
   división — si el texto solo menciona el nombre de la división sin listar
   las carreras específicas que contiene, omítela).
   Copia el nombre LITERALMENTE como aparece en el texto y agrega "sourceUrl"
   con la URL EXACTA de su encabezado [FUENTE OFICIAL: ...]. El servidor
   descartará cualquier nombre que no pueda encontrar palabra por palabra en
   esa fuente. Si UNIVERSIDAD menciona Campus, Plantel o Sede, incluye una
   carrera únicamente cuando el texto también confirme que se imparte en esa
   ubicación específica; no generalices la oferta de otros campus.
3. "costTier": SOLO si el texto indica claramente que es pública/gratuita
   ("public"), de costo accesible ("affordable"), o privada de alto costo
   ("private-premium"). Si no es claro, null.
4. "tuitionRange": solo si el texto menciona colegiatura/costo en cifras o
   rango explícito. Si no, null.
5. "modality": "presencial" | "en línea" | "híbrida" SOLO si el texto lo dice.
6. "admissionDates": fecha o periodo de examen de admisión, registro de ficha
   o convocatoria, SOLO si el texto lo menciona explícitamente. Si no, null.

UNIVERSIDAD: ${universityName}

TEXTO DE LA PÁGINA (puede estar incompleto o no tener toda la info):
"""
${siteText}
"""

SALIDA (JSON estricto, sin texto extra):
{
  "steamPrograms": [{ "name": "nombre literal", "area": "ciencia|tecnologia|ingenieria|artes|matematicas", "sourceUrl": "URL exacta de FUENTE OFICIAL" }],
  "costTier": "public" | "affordable" | "private-premium" | null,
  "tuitionRange": "string" | null,
  "modality": "string" | null,
  "admissionDates": "string" | null
}`;
  }

  /**
   * Variante de buildEnrichPrompt() para candidatos NUEVOS de Google Places
   * (findOrDiscoverNearby): además de completar campos, primero le pide a la
   * IA clasificar el tipo de institución — así se puede descartar de forma
   * automática lo que Places etiquetó como "university" pero en realidad es
   * una oficina/clínica/preparatoria/plantel cerrado. Mismo principio anti-
   * alucinación: null si el texto no lo confirma explícitamente.
   *
   * Nota de alcance: solo puede leer el sitio oficial de la institución (no
   * tiene acceso a RVOE/SEP ni a otros sistemas de gobierno), igual que el
   * enriquecimiento admin existente.
   */
  private buildDiscoveryPrompt(
    universityName: string,
    siteText: string,
  ): string {
    return `SISTEMA:
Eres un asistente que valida y extrae datos EXPLÍCITOS de la página web oficial
de una posible institución de educación superior en México. NUNCA inventes ni
completes con conocimiento externo o suposiciones — solo reporta lo que esté
literalmente en el texto dado. Si un dato no aparece explícitamente, null.

PASO 1 — Clasifica "institutionType" con UNA de estas opciones EXACTAS:
university | university_campus | technological_institute |
higher_education_institute | normal_school |
research_center_with_academic_programs | faculty_or_academic_unit |
high_school | government_office | administrative_office | legal_office |
clinic_or_service_center | duplicated_record | permanently_closed | other

PASO 2 — Solo si la clasificación es una institución de educación superior
real (no oficina, clínica, preparatoria, despacho ni registro cerrado/
duplicado), completa además:
1. "steamPrograms": solo CARRERAS INDIVIDUALES específicas (licenciatura,
   ingeniería, técnico superior) de las áreas Ciencia, Tecnología, Ingeniería,
   Artes o Matemáticas que el texto mencione literalmente.
   "area" debe ser una de: ciencia | tecnologia | ingenieria | artes | matematicas.
   NUNCA reportes como "programa" el nombre de una DIVISIÓN ACADÉMICA, CENTRO
   UNIVERSITARIO, FACULTAD o ÁREA GENERAL (ej. "Centro Universitario de
   Ciencias de la Salud", "Humanidades", "Ciencias Biológicas y Agropecuarias",
   "División de Ingenierías") — esos son agrupaciones administrativas, no una
   carrera. Ejemplo correcto: "Ingeniería en Software" (SÍ es una carrera).
   Ejemplo incorrecto: "Ciencias de la Salud" (NO es una carrera, es una
   división — si el texto solo menciona el nombre de la división sin listar
   las carreras específicas que contiene, omítela).
   Copia el nombre LITERALMENTE como aparece en el texto y agrega "sourceUrl"
   con la URL EXACTA de su encabezado [FUENTE OFICIAL: ...]. Si el NOMBRE
   DETECTADO contiene Campus, Plantel o Sede, incluye solo carreras que el
   texto confirme para esa ubicación; no mezcles la oferta de otros campus.
2. "costTier": SOLO si el texto indica claramente que es pública/gratuita
   ("public"), de costo accesible ("affordable"), o privada de alto costo
   ("private-premium"). Si no es claro, null.
3. "tuitionRange": solo si el texto menciona colegiatura/costo en cifras o
   rango explícito. Si no, null.
4. "modality": "presencial" | "en línea" | "híbrida" SOLO si el texto lo dice.
5. "admissionDates": fecha o periodo de examen de admisión, registro de ficha
   o convocatoria, SOLO si el texto lo menciona explícitamente. Si no, null.
Si la clasificación NO es de educación superior, deja esos 5 campos vacíos/null.

NOMBRE DETECTADO POR GOOGLE PLACES: ${universityName}

TEXTO DE LA PÁGINA (puede estar incompleto o no tener toda la info):
"""
${siteText}
"""

SALIDA (JSON estricto, sin texto extra):
{
  "institutionType": "string",
  "steamPrograms": [{ "name": "nombre literal", "area": "ciencia|tecnologia|ingenieria|artes|matematicas", "sourceUrl": "URL exacta de FUENTE OFICIAL" }],
  "costTier": "public" | "affordable" | "private-premium" | null,
  "tuitionRange": "string" | null,
  "modality": "string" | null,
  "admissionDates": "string" | null
}`;
  }

  private async callGroqEnrich(prompt: string): Promise<string> {
    if (!this.groq) throw new Error('Groq no configurado (sin API key)');
    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 3500,
    });
    return completion.choices[0]?.message?.content || '{}';
  }

  /**
   * Completa campos faltantes (steamPrograms/costTier/tuitionRange/modality)
   * leyendo su sitio real (o resolviéndolo primero con Places cuando falta)
   * y extrayendo con Groq bajo verificación literal. La oferta automática se
   * revalida y sustituye; la oferta curada por un admin nunca se sobreescribe.
   * Guarda `aiEnrichedAt`/`aiEnrichmentSource` como rastro de auditoría.
   */
  // Se procesan hasta 12 por clic en tandas concurrentes de 3. Así una zona
  // avanza completa sin disparar todas las peticiones a Groq simultáneamente.
  //
  // `filter` (opcional): texto a buscar en nombre/dirección (sin acentos,
  // sin mayúsculas) para priorizar una zona — sin él, el orden por
  // createdAt haría imposible llegar a estados descubiertos al final.
  async enrichUniversitiesWithAi(
    limit = 12,
    filter?: string,
  ): Promise<{
    processed: number;
    enriched: number;
    skipped: number;
    failed: number;
    errors: { name: string; error: string }[];
  }> {
    if (!this.groq) {
      throw new Error('GROQ_API_KEY no está configurada en el servidor.');
    }

    // NOTA: se evita SQL crudo con nombres de columna camelCase sin comillas
    // (createQueryBuilder().where('u.steamPrograms...')) porque Postgres
    // hace lowercase de identificadores sin comillas — la columna real que
    // crea TypeORM sí preserva mayúsculas, así que esa condición nunca
    // encontraba nada (0 candidatos, 0 errores: fallaba en silencio). Se usa
    // find() + operadores tipados, y los filtros en JS.
    const universities = await this.universityRepository.find({
      order: { createdAt: 'ASC' },
    });
    const googlePlacesKey = this.configService.get<string>(
      'GOOGLE_PLACES_API_KEY',
    );
    const wanted = filter ? this.normalizeName(filter) : '';
    const candidates = universities
      .filter(
        (u) =>
          (u.website?.trim() || (googlePlacesKey && u.location)) &&
          (!u.programsVerifiedAt ||
            !u.costTier ||
            !u.tuitionRange ||
            !u.modality ||
            u.aiEnrichmentStatus === 'failed') &&
          (!wanted ||
            this.normalizeName(u.name).includes(wanted) ||
            this.normalizeName(u.address || '').includes(wanted)),
      )
      .sort((a, b) => {
        const aUnverified = a.programsVerifiedAt ? 1 : 0;
        const bUnverified = b.programsVerifiedAt ? 1 : 0;
        if (aUnverified !== bUnverified) return aUnverified - bUnverified;
        return a.updatedAt.getTime() - b.updatedAt.getTime();
      })
      .slice(0, Math.max(1, Math.min(limit, 40)));

    let enriched = 0;
    let skipped = 0;
    const errors: { name: string; error: string }[] = [];

    const outcomes = await this.runInChunks(
      candidates,
      AiService.ENRICH_CHUNK_SIZE,
      async (uni) => {
        try {
          const result = await this.enrichUniversityFromOfficialSite(
            uni,
            googlePlacesKey,
          );
          return { uni, result };
        } catch (err) {
          this.logger.warn(
            `Enriquecimiento falló para "${uni.name}": ${err.message || err}`,
          );
          await this.markEnrichmentFailure(uni, err);
          return {
            uni,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    );

    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        errors.push({
          name: 'Universidad desconocida',
          error: String(outcome.reason),
        });
        continue;
      }
      if (outcome.value.error) {
        errors.push({
          name: outcome.value.uni.name,
          error: outcome.value.error,
        });
      } else if (
        outcome.value.result?.changed ||
        outcome.value.result?.verifiedPrograms
      ) {
        enriched++;
      } else {
        skipped++;
      }
    }

    return {
      processed: candidates.length,
      enriched,
      skipped,
      failed: errors.length,
      errors,
    };
  }
}
