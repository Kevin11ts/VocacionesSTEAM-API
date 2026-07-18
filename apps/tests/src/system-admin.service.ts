import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MotorVocacionalService } from './motor/motor-vocacional.service';

type ServiceStatus = 'operational' | 'configured' | 'degraded' | 'unconfigured';

@Injectable()
export class SystemAdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly motor: MotorVocacionalService,
  ) {}

  async getOverview() {
    const databaseStartedAt = Date.now();
    const [databaseInfo] = await this.dataSource.query(`
      SELECT
        pg_database_size(current_database())::bigint AS "sizeBytes",
        (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections,
        current_database() AS name
    `);
    const databaseLatencyMs = Date.now() - databaseStartedAt;

    const counts = await this.dataSource.query(`
      SELECT 'users' AS key, count(*)::int AS value FROM users
      UNION ALL SELECT 'vocationalTests', count(*)::int FROM vocational_tests
      UNION ALL SELECT 'questions', count(*)::int FROM questions
      UNION ALL SELECT 'activeQuestions', count(*)::int FROM questions WHERE status = 'activo'
      UNION ALL SELECT 'simulators', count(*)::int FROM career_simulators
      UNION ALL SELECT 'universities', count(*)::int FROM universities
      UNION ALL SELECT 'aiLogs', count(*)::int FROM ai_logs
      UNION ALL SELECT 'algorithmRuns', count(*)::int FROM algorithm_runs
      UNION ALL SELECT 'calibrationDecks', count(*)::int FROM calibration_decks
      UNION ALL SELECT 'careerCatalog', count(*)::int FROM career_catalog
      UNION ALL SELECT 'vocationCatalog', count(*)::int FROM vocation_catalog
      UNION ALL SELECT 'universityCache', count(*)::int FROM university_match_cache
    `);
    const dataCounts = Object.fromEntries(
      counts.map((row: { key: string; value: number | string }) => [
        row.key,
        Number(row.value),
      ]),
    );

    const [quality] = await this.dataSource.query(`
      SELECT
        (SELECT count(*)::int FROM options WHERE "questionId" IS NULL) AS "orphanOptions",
        (SELECT count(*)::int FROM career_simulators WHERE jsonb_array_length(steps) <> 6) AS "invalidSimulators",
        (SELECT count(*)::int FROM career_simulators WHERE status <> 'activo') AS "inactiveSimulators",
        (SELECT count(*)::int FROM universities WHERE "programsVerifiedAt" IS NULL) AS "unverifiedUniversities",
        (SELECT count(*)::int FROM universities WHERE "aiEnrichmentStatus" = 'failed') AS "failedUniversityEnrichments",
        (SELECT count(*)::int FROM vocational_tests WHERE profile IS NULL) AS "legacyProfiles",
        (SELECT count(*)::int FROM users WHERE NOT "isEmailVerified") AS "unverifiedUsers"
    `);

    const motorHealth = await this.motor.getHealth();
    const services: Array<{
      id: string;
      name: string;
      status: ServiceStatus;
      latencyMs: number | null;
      detail: string;
    }> = [
      {
        id: 'api',
        name: 'API NestJS',
        status: 'operational',
        latencyMs: null,
        detail: `Proceso activo · ${this.formatUptime(process.uptime())}`,
      },
      {
        id: 'database',
        name: 'PostgreSQL',
        status: 'operational',
        latencyMs: databaseLatencyMs,
        detail: `${databaseInfo.connections} conexiones`,
      },
      {
        id: 'motor',
        name: 'Motor Vocacional A0–A8',
        ...motorHealth,
      },
      this.integrationStatus(
        'ai',
        'IA · Groq',
        ['GROQ_API_KEY'],
        'Matching y enriquecimiento A8',
      ),
      this.integrationStatus(
        'maps',
        'Google Places',
        ['GOOGLE_PLACES_API_KEY'],
        'Descubrimiento y geocodificación',
      ),
      this.integrationStatus(
        'denue',
        'DENUE · INEGI',
        ['INEGI_DENUE_TOKEN'],
        'Censo de instituciones',
      ),
      this.integrationStatus(
        'mail',
        'Correo transaccional',
        ['RESEND_API_KEY', 'BREVO_API_KEY'],
        'OTP y recuperación de acceso',
        true,
      ),
    ];

    return {
      generatedAt: new Date().toISOString(),
      environment: {
        nodeEnv: this.config.get<string>('NODE_ENV', 'development'),
        nodeVersion: process.version,
        commit:
          this.config.get<string>('RAILWAY_GIT_COMMIT_SHA', '').slice(0, 8) ||
          null,
        uptimeSeconds: Math.round(process.uptime()),
      },
      services,
      database: {
        name: databaseInfo.name,
        sizeBytes: Number(databaseInfo.sizeBytes),
        connections: Number(databaseInfo.connections),
        latencyMs: databaseLatencyMs,
      },
      counts: dataCounts,
      quality: Object.fromEntries(
        Object.entries(quality).map(([key, value]) => [key, Number(value)]),
      ),
    };
  }

  async clearOperationalCache() {
    return this.dataSource.transaction(async (manager) => {
      const cache = await manager.query(
        'DELETE FROM university_match_cache RETURNING id',
      );
      const expiredOtps = await manager.query(
        'DELETE FROM otp_codes WHERE "expiresAt" < NOW() RETURNING id',
      );
      return {
        universityMatchCacheDeleted: Array.isArray(cache) ? cache.length : 0,
        expiredOtpCodesDeleted: Array.isArray(expiredOtps)
          ? expiredOtps.length
          : 0,
      };
    });
  }

  async cleanupOrphanOptions() {
    const deleted = await this.dataSource.query(
      'DELETE FROM options WHERE "questionId" IS NULL RETURNING id',
    );
    return { deleted: Array.isArray(deleted) ? deleted.length : 0 };
  }

  private integrationStatus(
    id: string,
    name: string,
    keys: string[],
    detail: string,
    anyKey = false,
  ) {
    const values = keys.map((key) => Boolean(this.config.get<string>(key)));
    const configured = anyKey ? values.some(Boolean) : values.every(Boolean);
    return {
      id,
      name,
      status: configured ? ('configured' as const) : ('unconfigured' as const),
      latencyMs: null,
      detail: configured
        ? `${detail} · configuración detectada, sin sondeo activo`
        : 'Variable de entorno pendiente',
    };
  }

  private formatUptime(totalSeconds: number): string {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days} d ${hours} h`;
    if (hours > 0) return `${hours} h ${minutes} min`;
    return `${minutes} min`;
  }
}
