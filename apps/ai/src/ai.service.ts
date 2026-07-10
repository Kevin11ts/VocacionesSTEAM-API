import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import Groq from 'groq-sdk';
import { AiLog, University } from '@app/common';
import { haversineKm } from './university-match.engine';

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

  async createUniversity(data: Partial<University>): Promise<University> {
    const university = this.universityRepository.create(data);
    return this.universityRepository.save(university);
  }

  async updateUniversity(
    id: string,
    data: Partial<University>,
  ): Promise<University | null> {
    await this.universityRepository.update(id, data);
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
                { lat: member.location.latitude, lng: member.location.longitude },
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
          error: 'Falta location.latitude/longitude (obligatorio para el matching)',
        });
        continue;
      }

      try {
        const university = this.universityRepository.create({
          ...row,
          name,
          location: { latitude: lat, longitude: lng },
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
    'Aguascalientes': '01',
    'Baja California': '02',
    'Baja California Sur': '03',
    'Campeche': '04',
    'Coahuila': '05',
    'Colima': '06',
    'Chiapas': '07',
    'Chihuahua': '08',
    'CDMX': '09',
    'Durango': '10',
    'Guanajuato': '11',
    'Guerrero': '12',
    'Hidalgo': '13',
    'Jalisco': '14',
    'Estado de México': '15',
    'Michoacán': '16',
    'Morelos': '17',
    'Nayarit': '18',
    'Nuevo León': '19',
    'Oaxaca': '20',
    'Puebla': '21',
    'Querétaro': '22',
    'Quintana Roo': '23',
    'San Luis Potosí': '24',
    'Sinaloa': '25',
    'Sonora': '26',
    'Tabasco': '27',
    'Tamaulipas': '28',
    'Tlaxcala': '29',
    'Veracruz': '30',
    'Yucatán': '31',
    'Zacatecas': '32',
  };

  private normalizeName(name: string): string {
    return (name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  /**
   * Nombres que Google Places / DENUE devuelven bajo el SCIAN de educación
   * pero que en realidad son oficinas de gobierno, sindicatos, clínicas o
   * servicios internos de una institución (no la institución en sí).
   * Se usa tanto para filtrar candidatos nuevos como para limpiar lo que
   * ya está guardado (ver cleanupJunkUniversities()).
   */
  private static readonly JUNK_NAME_PATTERNS: RegExp[] = [
    /^ESTACIONAMIENTO\b/i,
    /^SINDICATO\b/i,
    /^PRESIDENCIA MUNICIPAL\b/i,
    /^AYUNTAMIENTO\b/i,
    /^DELEGACION\b/i,
    /^SECRETARIA DE EDUCACI[OÓ]N P[UÚ]BLICA$/i, // exacto: la dependencia en sí, no un nombre que solo la incluye
    /^DESPACHO JUR[IÍ]DICO\b/i,
    /^DIRECCI[OÓ]N (GENERAL )?DE (FOMENTO|DEPORTE)\b/i,
    /^SITIO WEB TEMPORAL\b/i,
    /^ALMAC[EÉ]N\b/i,
    /^BODEGA\b/i,
    /^CAMPO DE (BEISBOL|F[UÚ]TBOL|DEPORTES|TIRO)\b/i,
    /^ABOGADO GENERAL\b/i,
    /^CONSEJO ACAD[EÉ]MICO\b/i,
    /^OFICINA ADMINISTRATIVA\b/i,
    /^FONDO DE\b/i,
    /SIN NOMBRE$/i, // artefacto del propio censo del INEGI, no un nombre real
  ];

  private isJunkName(name: string): boolean {
    const upper = (name || '').toUpperCase().trim();
    if (!upper) return true;
    return AiService.JUNK_NAME_PATTERNS.some((re) => re.test(upper));
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
      existing.map((u) => u.location).filter((l): l is { latitude: number; longitude: number } => !!l),
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
              ? { latitude: place.geometry.location.lat, longitude: place.geometry.location.lng }
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
      existing.map((u) => u.location).filter((l): l is { latitude: number; longitude: number } => !!l),
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
            address: [row.Tipo_vialidad, row.Calle, row.Num_Exterior, row.Colonia]
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
  private readonly ENRICH_GROQ_TIMEOUT_MS = 12_000;

  /** Descarga el HTML del sitio y lo reduce a texto plano (sin scripts/estilos/tags), acotado en tamaño. */
  private async fetchSiteText(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.ENRICH_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VocacionesSTEAMBot/1.0)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length < 50) {
        throw new Error('La página no devolvió suficiente texto (¿SPA sin contenido server-rendered?)');
      }
      return text.slice(0, 6000);
    } finally {
      clearTimeout(timer);
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout de ${ms}ms en ${label}`)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
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
2. "steamPrograms": solo carreras/programas de las áreas Ciencia, Tecnología,
   Ingeniería, Artes o Matemáticas que el texto mencione literalmente.
   "area" debe ser una de: ciencia | tecnologia | ingenieria | artes | matematicas.
3. "costTier": SOLO si el texto indica claramente que es pública/gratuita
   ("public"), de costo accesible ("affordable"), o privada de alto costo
   ("private-premium"). Si no es claro, null.
4. "tuitionRange": solo si el texto menciona colegiatura/costo en cifras o
   rango explícito. Si no, null.
5. "modality": "presencial" | "en línea" | "híbrida" SOLO si el texto lo dice.

UNIVERSIDAD: ${universityName}

TEXTO DE LA PÁGINA (puede estar incompleto o no tener toda la info):
"""
${siteText}
"""

SALIDA (JSON estricto, sin texto extra):
{
  "steamPrograms": [{ "name": "string", "area": "ciencia|tecnologia|ingenieria|artes|matematicas" }],
  "costTier": "public" | "affordable" | "private-premium" | null,
  "tuitionRange": "string" | null,
  "modality": "string" | null
}`;
  }

  private async callGroqEnrich(prompt: string): Promise<string> {
    if (!this.groq) throw new Error('Groq no configurado (sin API key)');
    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });
    return completion.choices[0]?.message?.content || '{}';
  }

  /**
   * Completa campos faltantes (steamPrograms/costTier/tuitionRange/modality)
   * de universidades que ya tienen `website` guardado, leyendo su sitio real
   * y extrayendo con Groq bajo un prompt anti-alucinación. NUNCA sobreescribe
   * un campo que el admin ya haya llenado a mano — solo rellena huecos.
   * Guarda `aiEnrichedAt`/`aiEnrichmentSource` como rastro de auditoría.
   */
  // ~7-8s por universidad (fetch del sitio + Groq): con 15 el lote se acerca
  // a los 2 minutos y arriesga que el proxy de Railway corte la conexión
  // antes de responder (medido: 3 universidades tardaron 23s reales). Se
  // baja a 5 (~35-40s) para que un clic siempre alcance a completar.
  async enrichUniversitiesWithAi(limit = 5): Promise<{
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
    // find() + operadores tipados, y el filtro de "campo faltante" en JS.
    const withWebsite = await this.universityRepository.find({
      where: { website: Not(IsNull()) },
      order: { createdAt: 'ASC' },
    });
    const candidates = withWebsite
      .filter(
        (u) =>
          u.website?.trim() &&
          (!u.steamPrograms?.length || !u.costTier || !u.tuitionRange || !u.modality),
      )
      .slice(0, limit);

    let enriched = 0;
    let skipped = 0;
    const errors: { name: string; error: string }[] = [];

    for (const uni of candidates) {
      try {
        const website = uni.website.startsWith('http') ? uni.website : `http://${uni.website}`;
        const siteText = await this.fetchSiteText(website);
        const prompt = this.buildEnrichPrompt(uni.name, siteText);
        const raw = await this.withTimeout(
          this.callGroqEnrich(prompt),
          this.ENRICH_GROQ_TIMEOUT_MS,
          'Groq (enriquecimiento)',
        );
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        let changed = false;
        if (!uni.steamPrograms?.length && Array.isArray(parsed.steamPrograms) && parsed.steamPrograms.length) {
          const validAreas = new Set(['ciencia', 'tecnologia', 'ingenieria', 'artes', 'matematicas']);
          const validPrograms = parsed.steamPrograms.filter(
            (p: any) => p?.name && validAreas.has(p?.area),
          );
          if (validPrograms.length) {
            uni.steamPrograms = validPrograms;
            changed = true;
          }
        }
        if (!uni.costTier && ['public', 'affordable', 'private-premium'].includes(parsed.costTier)) {
          uni.costTier = parsed.costTier;
          changed = true;
        }
        if (!uni.tuitionRange && typeof parsed.tuitionRange === 'string' && parsed.tuitionRange.trim()) {
          uni.tuitionRange = parsed.tuitionRange.trim();
          changed = true;
        }
        if (!uni.modality && typeof parsed.modality === 'string' && parsed.modality.trim()) {
          uni.modality = parsed.modality.trim();
          changed = true;
        }

        uni.aiEnrichedAt = new Date();
        uni.aiEnrichmentSource = website;
        await this.universityRepository.save(uni);

        if (changed) {
          enriched++;
        } else {
          skipped++;
        }
      } catch (err) {
        this.logger.warn(`Enriquecimiento falló para "${uni.name}": ${err.message || err}`);
        errors.push({ name: uni.name, error: err.message || String(err) });
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
