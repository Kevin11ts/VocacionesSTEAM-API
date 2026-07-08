import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiLog)
    private readonly aiLogRepository: Repository<AiLog>,
    @InjectRepository(University)
    private readonly universityRepository: Repository<University>,
  ) {}

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

  private normalizeName(name: string): string {
    return (name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
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
      select: ['name', 'location'],
    });
    const existingByName = new Map<
      string,
      { latitude: number; longitude: number }[]
    >();
    for (const u of existing) {
      const key = this.normalizeName(u.name);
      const list = existingByName.get(key) ?? [];
      if (u.location) list.push(u.location);
      existingByName.set(key, list);
    }

    /** true si ya hay una universidad con el mismo nombre a <5km (mismo campus, ya importado). */
    const isSameCampusAsExisting = (
      name: string,
      loc?: { latitude: number; longitude: number },
    ): boolean => {
      const candidates = existingByName.get(this.normalizeName(name));
      if (!candidates?.length) return false;
      if (!loc) return true; // sin coordenadas no podemos distinguir campus: por seguridad, se trata como duplicado
      return candidates.some(
        (c) =>
          haversineKm(
            { lat: c.latitude, lng: c.longitude },
            { lat: loc.latitude, lng: loc.longitude },
          ) < 5,
      );
    };

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
          if (!place.place_id || place.business_status === 'CLOSED_PERMANENTLY') {
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

          if (isSameCampusAsExisting(place.name, loc)) {
            skippedExisting++;
            continue;
          }
          // Registra este campus para que otro término/ciudad no lo vuelva a agregar en la misma corrida.
          const key = this.normalizeName(place.name);
          const list = existingByName.get(key) ?? [];
          if (loc) list.push(loc);
          existingByName.set(key, list);

          newRows.push({
            name: place.name,
            location: loc
              ? { latitude: loc.latitude, longitude: loc.longitude }
              : undefined,
            address: place.formatted_address,
            rating: place.rating,
          });
        }
      }
    }

    const result = await this.bulkCreateUniversities(newRows);
    return { totalFound, skippedExisting, ...result };
  }
}
