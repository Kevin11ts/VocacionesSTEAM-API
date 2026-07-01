import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import {
  Question,
  User,
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
  computeDominantAxes,
  computeTheoreticalVector,
  countAnswersByAxis,
  recommendCareers,
  recommendVocations,
} from './profile-engine';

/**
 * Orquestador del motor vocacional (A1→A7): convierte las respuestas en
 * conteos por eje, corre las funciones puras del motor con los catálogos
 * de BD y persiste el perfil resultante como parte del historial.
 *
 * Etapa 1 del mandato (§15): perfil mínimo funcional solo con el test
 * teórico. Los aportes de calibración (A2) y simuladores (A3) se integran
 * en la etapa 2.
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
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * POST /profile/compute — corre A1→A7 y devuelve el VocationalProfile.
   * Crea una nueva entrada en el historial de tests del usuario.
   */
  async computeProfile(
    userId: string,
    request: ProfileComputationRequest,
  ): Promise<VocationalProfile> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    const raw = await this.countTheoretical(request.theoreticalAnswers);
    const profile = await this.assembleProfile(raw);

    const testCount = await this.testsRepository.count({
      where: { user: { id: userId } },
    });
    const test = this.testsRepository.create({
      user,
      testName: `Test Vocacional ${testCount + 1}`,
      answers: request.theoreticalAnswers,
      profileScores: { ...profile.steamScores } as Record<string, number>,
      dominantTraits: this.legacyDominantTraits(profile.dominantAxes),
      profile,
    });
    await this.testsRepository.save(test);

    return profile;
  }

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

    // A4 — fusión (etapa 1: sin calibración ni simuladores; la
    // renormalización por eje devuelve el teórico intacto)
    const steamScores = blendVectors(baseVector, null, null);
    const dominantAxes = computeDominantAxes(steamScores);

    // A5 — medidor de calibración
    const calibration = computeCalibrationState(0, 0);

    // Narrativa y derivados de plantilla
    const narrative = buildNarrative(
      dominantAxes,
      steamScores,
      calibration,
      axisMeta,
    );
    const strengths = buildStrengths(dominantAxes, axisMeta);
    const workStyle = buildWorkStyle(dominantAxes, axisMeta);
    const nextSteps = buildNextSteps(0, 0);

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
