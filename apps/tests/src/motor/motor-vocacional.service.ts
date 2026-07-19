import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import {
  AlgorithmRun,
  ProfileComputationRequest,
  Question,
  SimulatorBiasFlags,
  SimulatorDecisionInput,
  SteamAxis,
  VocationalProfile,
  VocationalTest,
} from '@app/common';
import { CatalogService } from '../profile/catalog.service';
import { ProfileService } from '../profile/profile.service';
import { countAnswersByAxis } from '../profile/profile-engine';

interface RemoteProfileResponse {
  algorithm: string;
  version: string;
  executionTimeMs: number;
  algorithmBreakdown: unknown;
  profile: VocationalProfile;
}

export interface PersistedMotorProfile extends RemoteProfileResponse {
  runId: string;
}

/**
 * Cliente del Motor Vocacional API: el servicio externo (FastAPI en
 * Railway) que contiene los algoritmos A0-A8 como obra independiente.
 *
 * Este servicio delega el cálculo al motor remoto y PERSISTE cada corrida
 * (resultado + métricas + tiempo de ejecución) en `algorithm_runs`, de
 * modo que los resultados del modelo desplegado queden consultables desde
 * la aplicación.
 */
@Injectable()
export class MotorVocacionalService {
  private readonly logger = new Logger(MotorVocacionalService.name);

  constructor(
    @InjectRepository(AlgorithmRun)
    private readonly runRepository: Repository<AlgorithmRun>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    private readonly configService: ConfigService,
    private readonly catalogService: CatalogService,
    private readonly profileService: ProfileService,
  ) {}

  private get baseUrl(): string {
    const url = this.configService.get<string>('MOTOR_VOCACIONAL_URL', '');
    return url.replace(/\/+$/, '');
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async getHealth(): Promise<{
    status: 'operational' | 'degraded' | 'unconfigured';
    latencyMs: number | null;
    detail: string;
  }> {
    if (!this.isConfigured) {
      return {
        status: 'unconfigured',
        latencyMs: null,
        detail: 'MOTOR_VOCACIONAL_URL no está configurada',
      };
    }
    const startedAt = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        return {
          status: 'degraded',
          latencyMs,
          detail: `Healthcheck respondió HTTP ${response.status}`,
        };
      }
      return {
        status: 'operational',
        latencyMs,
        detail: 'Motor A0–A8 disponible',
      };
    } catch (error) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - startedAt,
        detail:
          error instanceof Error
            ? error.message
            : 'No respondió al healthcheck',
      };
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.isConfigured) {
      throw new RpcException(
        'Motor Vocacional no configurado (variable MOTOR_VOCACIONAL_URL)',
      );
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = this.configService.get<string>('MOTOR_VOCACIONAL_API_KEY');
    if (apiKey) headers['X-API-Key'] = apiKey;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : 'error de conexión desconocido';
      this.logger.error(`Motor Vocacional ${path} no disponible: ${detail}`);
      throw new RpcException('Motor Vocacional no disponible');
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `Motor Vocacional ${path} → ${response.status}: ${detail}`,
      );
      throw new RpcException(
        `Motor Vocacional respondió ${response.status} en ${path}`,
      );
    }
    return (await response.json()) as T;
  }

  /**
   * Computa el perfil vocacional en el MOTOR REMOTO (A0: A1→A7) usando la
   * misma evidencia que el motor local (respuestas + calibraciones y
   * simuladores guardados) y los catálogos administrables de BD. Persiste
   * la corrida con su desglose de tiempos.
   */
  async computeProfileRemote(
    userId: string,
    request: ProfileComputationRequest,
  ): Promise<PersistedMotorProfile> {
    const motorResponse = await this.requestProfileRemote(userId, request);
    const run = await this.runRepository.save(
      this.runRepository.create(this.runValues(userId, motorResponse)),
    );

    return { runId: run.id, ...motorResponse };
  }

  /** Ejecuta FastAPI sin persistir; el caller decide la transacción local. */
  private async requestProfileRemote(
    userId: string,
    request: ProfileComputationRequest,
  ): Promise<RemoteProfileResponse> {
    const raw = await this.countTheoretical(request.theoreticalAnswers);
    const calibrationResults =
      request.calibrationResults ??
      (await this.profileService.loadStoredCalibrations(userId));
    const simulatorResults =
      request.simulatorResults ??
      (await this.profileService.loadStoredSimulatorResults(userId));
    const [vocationCatalog, careerCatalog] = await Promise.all([
      this.catalogService.getVocationCatalog(),
      this.catalogService.getCareerCatalog(),
    ]);

    return this.post<RemoteProfileResponse>('/v1/profile/compute', {
      theoreticalCounts: raw,
      calibrationResults,
      simulatorResults,
      vocationCatalog,
      careerCatalog,
    });
  }

  private runValues(userId: string, response: RemoteProfileResponse) {
    return {
      algorithm: response.algorithm ?? 'A0',
      engineVersion: response.version,
      profileVersion: response.profile?.profileVersion,
      userId,
      executionTimeMs: response.executionTimeMs,
      breakdown: response.algorithmBreakdown,
      result: response.profile,
      aiUsed: false,
    };
  }

  /**
   * Flujo canónico de la aplicación: calcula en FastAPI, registra la corrida
   * y persiste el mismo perfil en el historial que consume la PWA.
   */
  async computeAndPersistProfile(
    userId: string,
    request: ProfileComputationRequest,
  ): Promise<{
    test: VocationalTest;
    profile: VocationalProfile;
    run: PersistedMotorProfile | null;
  }> {
    const existing = await this.profileService.findByClientSubmissionId(
      userId,
      request.clientSubmissionId,
    );
    if (existing?.profile) {
      return { test: existing, profile: existing.profile, run: null };
    }

    const motorResponse = await this.requestProfileRemote(userId, request);
    try {
      return await this.runRepository.manager.transaction(async (manager) => {
        const existingInTransaction =
          await this.profileService.findByClientSubmissionId(
            userId,
            request.clientSubmissionId,
            manager,
          );
        if (existingInTransaction?.profile) {
          return {
            test: existingInTransaction,
            profile: existingInTransaction.profile,
            run: null,
          };
        }

        const test = await this.profileService.persistComputedProfile(
          userId,
          request,
          motorResponse.profile,
          manager,
        );
        const repository = manager.getRepository(AlgorithmRun);
        const savedRun = await repository.save(
          repository.create(this.runValues(userId, motorResponse)),
        );
        return {
          test,
          profile: motorResponse.profile,
          run: { runId: savedRun.id, ...motorResponse },
        };
      });
    } catch (error) {
      // Una carrera entre dos reintentos puede alcanzar el índice único. La
      // transacción revierte la corrida duplicada y devolvemos la confirmada.
      const confirmed = await this.profileService.findByClientSubmissionId(
        userId,
        request.clientSubmissionId,
      );
      if (confirmed?.profile) {
        return { test: confirmed, profile: confirmed.profile, run: null };
      }
      throw error;
    }
  }

  /** Contrato directo que ya consume POST /profile/compute en Angular. */
  async computeProfileForApplication(
    userId: string,
    request: ProfileComputationRequest,
  ): Promise<VocationalProfile> {
    const { profile } = await this.computeAndPersistProfile(userId, request);
    return profile;
  }

  /**
   * Recalcula el último test con la evidencia vigente de calibraciones y
   * simuladores. Cada recálculo también genera una fila en algorithm_runs.
   */
  async recomputeLatestProfile(
    userId: string,
  ): Promise<VocationalProfile | null> {
    const request =
      await this.profileService.getLatestComputationRequest(userId);
    if (!request) return null;

    const run = await this.computeProfileRemote(userId, request);
    return this.profileService.updateLatestComputedProfile(userId, run.profile);
  }

  async submitCalibrationAndRecompute(
    userId: string,
    moduleId: string,
    answers: Array<{ axis: SteamAxis; liked: boolean }>,
    clientSubmissionId?: string,
  ) {
    const { alreadyProcessed, profileApplied } =
      await this.profileService.saveCalibration(
        userId,
        moduleId,
        answers,
        clientSubmissionId,
      );
    if (alreadyProcessed && profileApplied) {
      const profile =
        await this.profileService.getLatestComputedProfile(userId);
      return { success: true, moduleId, profile };
    }
    const profile = await this.recomputeLatestProfile(userId);
    await this.profileService.markCalibrationProfileApplied(
      userId,
      clientSubmissionId,
    );
    return { success: true, moduleId, profile };
  }

  async submitSimulatorAndRecompute(
    userId: string,
    careerSlug: string,
    decisions: SimulatorDecisionInput[],
    biasFlags?: SimulatorBiasFlags,
    clientSubmissionId?: string,
  ) {
    const { affinity, feedback, alreadyProcessed, profileApplied } =
      await this.profileService.saveSimulatorResult(
        userId,
        careerSlug,
        decisions,
        biasFlags,
        clientSubmissionId,
      );
    if (alreadyProcessed && profileApplied) {
      const profile =
        await this.profileService.getLatestComputedProfile(userId);
      return { success: true, affinity, feedback, profile };
    }
    const profile = await this.recomputeLatestProfile(userId);
    await this.profileService.markSimulatorProfileApplied(
      userId,
      clientSubmissionId,
    );
    return { success: true, affinity, feedback, profile };
  }

  /** Corridas persistidas del usuario (resultados consultables). */
  async getRuns(userId: string, limit = 20) {
    return this.runRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Métricas agregadas de análisis por algoritmo sobre TODAS las corridas
   * persistidas: ejecuciones, tiempo promedio/mínimo/máximo y última corrida.
   */
  async getMetrics() {
    const rows: Array<{
      algorithm: string;
      runs: string;
      avgms: string;
      minms: string;
      maxms: string;
      lastrunat: Date;
    }> = await this.runRepository
      .createQueryBuilder('run')
      .select('run.algorithm', 'algorithm')
      .addSelect('COUNT(*)', 'runs')
      .addSelect('AVG(run.executionTimeMs)', 'avgms')
      .addSelect('MIN(run.executionTimeMs)', 'minms')
      .addSelect('MAX(run.executionTimeMs)', 'maxms')
      .addSelect('MAX(run.createdAt)', 'lastrunat')
      .groupBy('run.algorithm')
      .orderBy('run.algorithm', 'ASC')
      .getRawMany();

    return rows.map((row) => ({
      algorithm: row.algorithm,
      runs: Number(row.runs),
      avgMs: Math.round(Number(row.avgms) * 1000) / 1000,
      minMs: Number(row.minms),
      maxMs: Number(row.maxms),
      lastRunAt: row.lastrunat,
    }));
  }

  private async countTheoretical(
    answers: Record<string, string>,
  ): Promise<Record<SteamAxis, number>> {
    const questions = await this.questionRepository.find({
      relations: ['options'],
    });
    return countAnswersByAxis(answers || {}, questions);
  }
}
