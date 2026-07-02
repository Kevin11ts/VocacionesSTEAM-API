import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import {
  CalibrationModuleResult,
  CalibrationResult,
  CareerSimulator,
  Question,
  SimulatorAffinityResult,
  SimulatorBiasFlags,
  SimulatorDecisionInput,
  User,
  UserHistory,
  VocationalTest,
  ProfileComputationRequest,
  ProfileContribution,
  SteamAxis,
  VocationalProfile,
  PROFILE_VERSION,
  SOURCE_WEIGHTS,
} from '@app/common';
import { CatalogService } from './catalog.service';
import {
  blendVectors,
  buildNarrative,
  buildNextSteps,
  buildStrengths,
  buildWorkStyle,
  computeCalibrationState,
  computeCalibrationVector,
  computeDominantAxes,
  computeSimulatorAffinity,
  computeSimulatorVector,
  computeTheoreticalVector,
  countAnswersByAxis,
  deriveBiasFlags,
  normalizeAxisKey,
  recommendCareers,
  recommendVocations,
} from './profile-engine';

const SIMULATOR_ACTIVITY = 'SIMULATOR';

/**
 * Orquestador del motor vocacional (A1→A7): convierte las respuestas en
 * conteos por eje, corre las funciones puras del motor con los catálogos
 * de BD y persiste el perfil resultante como parte del historial.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(VocationalTest)
    private readonly testsRepository: Repository<VocationalTest>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(CalibrationResult)
    private readonly calibrationRepository: Repository<CalibrationResult>,
    @InjectRepository(UserHistory)
    private readonly userHistoryRepository: Repository<UserHistory>,
    @InjectRepository(CareerSimulator)
    private readonly careerSimulatorRepository: Repository<CareerSimulator>,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * POST /profile/compute — corre A1→A7 y devuelve el VocationalProfile.
   * Crea una nueva entrada en el historial de tests del usuario. Si el
   * request no trae calibración/simuladores, usa los guardados en BD.
   */
  async computeProfile(
    userId: string,
    request: ProfileComputationRequest,
  ): Promise<VocationalProfile> {
    const { profile } = await this.computeAndPersist(userId, request);
    return profile;
  }

  /**
   * Variante que además expone la entrada de historial creada (la usa el
   * endpoint legacy tests.submit para conservar su forma de respuesta).
   */
  async computeAndPersist(
    userId: string,
    request: ProfileComputationRequest,
  ): Promise<{ test: VocationalTest; profile: VocationalProfile }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    const raw = await this.countTheoretical(request.theoreticalAnswers);
    const calibrationResults =
      request.calibrationResults ?? (await this.loadStoredCalibrations(userId));
    const simulatorResults =
      request.simulatorResults ??
      (await this.loadStoredSimulatorResults(userId));

    const profile = await this.assembleProfile(
      raw,
      calibrationResults,
      simulatorResults,
    );

    const testCount = await this.testsRepository.count({
      where: { user: { id: userId } },
    });
    let test = this.testsRepository.create({
      user,
      testName: `Test Vocacional ${testCount + 1}`,
      answers: request.theoreticalAnswers,
      profileScores: { ...profile.steamScores } as Record<string, number>,
      dominantTraits: this.legacyDominantTraits(profile.dominantAxes),
      profile,
    });
    test = await this.testsRepository.save(test);

    return { test, profile };
  }

  /**
   * POST /calibration/submit — guarda (upsert por usuario+módulo) el
   * módulo de swipes y recomputa el perfil más reciente del usuario.
   */
  async submitCalibrationAndRecompute(
    userId: string,
    moduleId: string,
    answers: Array<{ axis: SteamAxis; liked: boolean }>,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    let calibration = await this.calibrationRepository.findOne({
      where: { user: { id: userId }, moduleId },
    });
    if (calibration) {
      calibration.answers = answers;
    } else {
      calibration = this.calibrationRepository.create({
        user,
        moduleId,
        answers,
      });
    }
    await this.calibrationRepository.save(calibration);

    const profile = await this.recomputeLatestProfile(userId);
    return { success: true, moduleId, profile };
  }

  /**
   * POST /simulator/submit — corre A3a sobre las decisiones contra los
   * pasos del simulador en BD, guarda el resultado (reemplaza el intento
   * anterior de la misma carrera) y recomputa el perfil.
   */
  async submitSimulatorAndRecompute(
    userId: string,
    careerSlug: string,
    decisions: SimulatorDecisionInput[],
    biasFlags?: SimulatorBiasFlags,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    const simulator = await this.careerSimulatorRepository.findOne({
      where: { slug: careerSlug },
    });
    if (!simulator) throw new RpcException('Simulator not found');

    const steps = Array.isArray(simulator.steps) ? simulator.steps : [];
    const flags = biasFlags ?? deriveBiasFlags(decisions, steps);
    const { result, feedback } = computeSimulatorAffinity({
      careerSlug,
      careerName: simulator.careerName,
      steamAreaName: simulator.steamArea,
      steps,
      decisions,
      biasFlags: flags,
    });

    // Un intento por carrera: el nuevo resultado reemplaza al anterior.
    let history = await this.userHistoryRepository.findOne({
      where: {
        userId,
        activityType: SIMULATOR_ACTIVITY,
        activityId: careerSlug,
      },
    });
    const results = {
      affinity: result,
      feedback,
      completedAt: new Date().toISOString(),
    };
    if (history) {
      history.results = results;
    } else {
      history = this.userHistoryRepository.create({
        user,
        userId,
        activityType: SIMULATOR_ACTIVITY,
        activityId: careerSlug,
        results,
      });
    }
    await this.userHistoryRepository.save(history);

    const profile = await this.recomputeLatestProfile(userId);
    return { success: true, affinity: result, feedback, profile };
  }

  /**
   * Recalcula el perfil del test más reciente del usuario con TODA la
   * evidencia guardada (calibraciones + simuladores) y lo persiste sobre
   * la misma entrada del historial. Devuelve null si aún no hay test
   * teórico del cual partir.
   */
  private async recomputeLatestProfile(
    userId: string,
  ): Promise<VocationalProfile | null> {
    const test = await this.testsRepository.findOne({
      where: { user: { id: userId } },
      order: { completedAt: 'DESC' },
    });
    if (!test) return null;

    const raw = await this.countTheoretical(test.answers);
    const calibrationResults = await this.loadStoredCalibrations(userId);
    const simulatorResults = await this.loadStoredSimulatorResults(userId);

    const profile = await this.assembleProfile(
      raw,
      calibrationResults,
      simulatorResults,
    );

    test.profileScores = { ...profile.steamScores } as Record<string, number>;
    test.dominantTraits = this.legacyDominantTraits(profile.dominantAxes);
    test.profile = profile;
    await this.testsRepository.save(test);

    return profile;
  }

  /**
   * GET /simulator/results — resultados de simuladores del usuario (el
   * intento más reciente por carrera), para que el catálogo muestre
   * completados y scores en cualquier dispositivo.
   */
  async getSimulatorResults(userId: string) {
    const rows = await this.userHistoryRepository.find({
      where: { userId, activityType: SIMULATOR_ACTIVITY },
      order: { createdAt: 'ASC' },
    });
    const bySlug = new Map<string, any>();
    for (const row of rows) {
      const affinity = row.results?.affinity;
      if (affinity && typeof affinity.affinity === 'number') {
        bySlug.set(row.activityId, {
          careerSlug: row.activityId,
          axis: affinity.axis,
          affinity: affinity.affinity,
          biasFlags: affinity.biasFlags ?? null,
          feedback: row.results?.feedback ?? null,
          completedAt: row.results?.completedAt ?? row.createdAt,
        });
      }
    }
    return [...bySlug.values()];
  }

  // =========================================================================
  //  Carga de evidencia guardada
  // =========================================================================

  private async loadStoredCalibrations(
    userId: string,
  ): Promise<CalibrationModuleResult[]> {
    const rows = await this.calibrationRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      moduleId: row.moduleId,
      answers: Array.isArray(row.answers)
        ? row.answers.filter(
            (a: any) =>
              a &&
              typeof a.liked === 'boolean' &&
              normalizeAxisKey(a.axis) !== null,
          )
        : [],
    }));
  }

  private async loadStoredSimulatorResults(
    userId: string,
  ): Promise<SimulatorAffinityResult[]> {
    const rows = await this.userHistoryRepository.find({
      where: { userId, activityType: SIMULATOR_ACTIVITY },
      order: { createdAt: 'ASC' },
    });
    // Un resultado por carrera: el más reciente reemplaza a los anteriores.
    const bySlug = new Map<string, SimulatorAffinityResult>();
    for (const row of rows) {
      const affinity = row.results?.affinity;
      if (
        affinity &&
        typeof affinity.affinity === 'number' &&
        normalizeAxisKey(affinity.axis) !== null
      ) {
        bySlug.set(row.activityId, affinity);
      }
    }
    return [...bySlug.values()];
  }

  // =========================================================================
  //  Pipeline determinista A1→A7
  // =========================================================================

  /**
   * Mapea las respuestas { questionId: letra } al conteo crudo por eje que
   * consume A1, usando el steamTrait de la opción elegida en BD.
   */
  private async countTheoretical(
    answers: Record<string, string>,
  ): Promise<Record<SteamAxis, number>> {
    const questions = await this.questionRepository.find({
      relations: ['options'],
    });
    return countAnswersByAxis(answers || {}, questions);
  }

  /** Corre el pipeline determinista completo sobre los conteos crudos. */
  private async assembleProfile(
    raw: Record<SteamAxis, number>,
    calibrationResults: CalibrationModuleResult[],
    simulatorResults: SimulatorAffinityResult[],
  ): Promise<VocationalProfile> {
    const [vocationCatalog, careerCatalog, axisMeta] = await Promise.all([
      this.catalogService.getVocationCatalog(),
      this.catalogService.getCareerCatalog(),
      this.catalogService.getAxisMeta(),
    ]);

    const contributions: ProfileContribution[] = [];

    // A1 — vector teórico (siempre presente)
    const baseVector = computeTheoreticalVector(raw);
    contributions.push({
      source: 'theoretical',
      label: 'Test teórico (20 preguntas)',
      weight: SOURCE_WEIGHTS.theoretical,
      vector: { ...baseVector },
      takenAt: new Date().toISOString(),
    });

    // A2 — vector de calibración (parcial, RG-9)
    const calibVector = computeCalibrationVector(calibrationResults);
    if (calibrationResults.length) {
      contributions.push({
        source: 'calibration',
        label: `Tests de calibración (${calibrationResults.length})`,
        weight: SOURCE_WEIGHTS.calibration,
        vector: calibVector ?? {},
      });
    }

    // A3b — vector de simuladores (parcial, RG-9)
    const simVector = computeSimulatorVector(simulatorResults);
    if (simulatorResults.length) {
      contributions.push({
        source: 'simulator',
        label: `Simuladores de carrera (${simulatorResults.length})`,
        weight: SOURCE_WEIGHTS.simulator,
        vector: simVector ?? {},
      });
    }

    // A4 — fusión con renormalización de pesos por eje
    const steamScores = blendVectors(baseVector, calibVector, simVector);
    const dominantAxes = computeDominantAxes(steamScores);

    // A5 — medidor de calibración
    const calibration = computeCalibrationState(
      calibrationResults.length,
      simulatorResults.length,
    );

    // Narrativa y derivados de plantilla
    const narrative = buildNarrative(
      dominantAxes,
      steamScores,
      calibration,
      axisMeta,
    );
    const strengths = buildStrengths(dominantAxes, axisMeta);
    const workStyle = buildWorkStyle(dominantAxes, axisMeta);
    const nextSteps = buildNextSteps(
      calibrationResults.length,
      simulatorResults.length,
    );

    // A6 / A7 — recomendaciones sobre catálogos de BD
    const recommendedVocations = recommendVocations(
      dominantAxes,
      steamScores,
      vocationCatalog,
    );
    const recommendedCareers = recommendCareers(
      dominantAxes,
      steamScores,
      careerCatalog,
      axisMeta,
    );

    return {
      steamScores,
      dominantAxes,
      ...narrative,
      calibration,
      contributions,
      strengths,
      workStyle,
      recommendedVocations,
      recommendedCareers,
      nextSteps,
      generatedAt: new Date().toISOString(),
      profileVersion: PROFILE_VERSION,
    };
  }

  /** Cadena legacy "Tecnologia + Ciencia" para la columna dominantTraits. */
  private legacyDominantTraits(dominantAxes: SteamAxis[]): string {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(dominantAxes[0])} + ${cap(dominantAxes[1])}`;
  }
}
