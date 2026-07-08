import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiLog, University } from '@app/common';

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
}
