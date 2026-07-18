import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User,
  VocationalTest,
  Question,
  Option,
  UserSettings,
  OtpCode,
  CreateQuestionDto,
  CareerSimulator,
  ComplementaryTest,
  UserHistory,
  CalibrationResult,
} from '@app/common';
import { RpcException } from '@nestjs/microservices';
import { ProfileService } from './profile/profile.service';

@Injectable()
export class TestsService {
  private readonly logger = new Logger(TestsService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(VocationalTest)
    private readonly testsRepository: Repository<VocationalTest>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(Option)
    private readonly optionRepository: Repository<Option>,
    @InjectRepository(CareerSimulator)
    private readonly careerSimulatorRepository: Repository<CareerSimulator>,
    @InjectRepository(ComplementaryTest)
    private readonly compTestRepository: Repository<ComplementaryTest>,
    @InjectRepository(UserHistory)
    private readonly userHistoryRepository: Repository<UserHistory>,
    @InjectRepository(CalibrationResult)
    private readonly calibrationRepository: Repository<CalibrationResult>,
    private readonly profileService: ProfileService,
  ) {}

  async getQuestions() {
    return this.questionRepository.find({
      relations: ['options'],
      order: { order: 'ASC' },
    });
  }

  async getActiveQuestions() {
    return this.questionRepository.find({
      where: { status: 'activo' },
      relations: ['options'],
      order: { order: 'ASC' },
    });
  }

  async createQuestion(data: any) {
    this.assertQuestionPayload(data);
    return this.questionRepository.manager.transaction(async (manager) => {
      const questionRepo = manager.getRepository(Question);
      const optionRepo = manager.getRepository(Option);
      const question = await questionRepo.save(
        questionRepo.create({
          text: data.text.trim(),
          order: Number(data.order) || 1,
          status: data.status === 'inactivo' ? 'inactivo' : 'activo',
        }),
      );
      await optionRepo.save(
        data.options.map((option: any) =>
          optionRepo.create({
            text: option.text.trim(),
            letter: option.letter.trim().toUpperCase(),
            steamTrait: option.steamTrait,
            question,
          }),
        ),
      );
      return questionRepo.findOne({
        where: { id: question.id },
        relations: ['options'],
      });
    });
  }

  async createBulkQuestions(questions: CreateQuestionDto[]): Promise<any> {
    const created = [];
    for (const q of questions) {
      const result = await this.createQuestion(q);
      created.push(result);
    }
    return { total: created.length, questions: created };
  }

  async updateQuestion(id: string, data: any) {
    const question = await this.questionRepository.findOne({
      where: { id },
      relations: ['options'],
    });
    if (!question) throw new RpcException('Question not found');

    if (data.options !== undefined)
      this.assertQuestionPayload({ ...question, ...data });

    return this.questionRepository.manager.transaction(async (manager) => {
      const questionRepo = manager.getRepository(Question);
      const optionRepo = manager.getRepository(Option);
      if (data.text !== undefined) question.text = String(data.text).trim();
      if (data.order !== undefined) question.order = Number(data.order) || 1;
      if (data.status !== undefined) {
        question.status = data.status === 'inactivo' ? 'inactivo' : 'activo';
      }
      await questionRepo.save(question);

      if (data.options !== undefined) {
        await optionRepo
          .createQueryBuilder()
          .delete()
          .where('"questionId" = :id', { id })
          .execute();
        await optionRepo.save(
          data.options.map((option: any) =>
            optionRepo.create({
              text: option.text.trim(),
              letter: option.letter.trim().toUpperCase(),
              steamTrait: option.steamTrait,
              question,
            }),
          ),
        );
      }

      return questionRepo.findOne({ where: { id }, relations: ['options'] });
    });
  }

  private assertQuestionPayload(data: any): void {
    const validTraits = new Set([
      'ciencia',
      'tecnologia',
      'ingenieria',
      'artes',
      'matematicas',
    ]);
    if (!String(data?.text || '').trim()) {
      throw new RpcException('El texto de la pregunta es obligatorio.');
    }
    if (!Array.isArray(data?.options) || data.options.length < 2) {
      throw new RpcException('Cada pregunta necesita al menos 2 opciones.');
    }
    const letters = new Set<string>();
    for (const option of data.options) {
      const letter = String(option?.letter || '')
        .trim()
        .toUpperCase();
      if (!String(option?.text || '').trim() || !/^[A-Z]$/.test(letter)) {
        throw new RpcException(
          'Cada opción necesita texto y una letra de A a Z.',
        );
      }
      if (letters.has(letter)) {
        throw new RpcException(
          `La letra ${letter} está repetida en la pregunta.`,
        );
      }
      if (!validTraits.has(option.steamTrait)) {
        throw new RpcException(`Rasgo STEAM inválido en la opción ${letter}.`);
      }
      letters.add(letter);
    }
  }

  async deleteQuestion(id: string) {
    const question = await this.questionRepository.findOne({
      where: { id },
      relations: ['options'],
    });
    if (!question) throw new RpcException('Question not found');
    await this.questionRepository.remove(question);
    return { success: true, message: 'Question deleted' };
  }

  /**
   * Endpoint legacy de envío de test. Ahora corre el motor determinista
   * (A1-A7) en lugar de llamar a la IA: la descripción del perfil sale de
   * las plantillas narrativas y las universidades se piden aparte vía
   * POST /universities/match (A8).
   */
  async submitTest(
    userId: string,
    answers: Record<string, string>,
    locationInput?: string,
  ) {
    const { test, profile } = await this.profileService.computeAndPersist(
      userId,
      { theoreticalAnswers: answers, locationInput },
    );

    return {
      testId: test.id,
      scores: profile.steamScores,
      dominantTraits: test.dominantTraits,
      aiProfileDescription: profile.profileSummary,
      recommendations: [],
      profile,
    };
  }

  async getTestHistory(userId: string) {
    const tests = await this.testsRepository.find({
      where: { user: { id: userId } },
      order: { completedAt: 'DESC' },
      select: [
        'id',
        'testName',
        'completedAt',
        'dominantTraits',
        'profileScores',
      ],
    });
    return tests;
  }

  async getLatestTest(userId: string) {
    const test = await this.testsRepository.findOne({
      where: { user: { id: userId } },
      order: { completedAt: 'DESC' },
      relations: ['recommendation'],
    });

    if (!test) return null;

    return {
      testId: test.id,
      testName: test.testName,
      completedAt: test.completedAt,
      scores: test.profileScores,
      dominantTraits: test.dominantTraits,
      answers: test.answers,
      aiProfileDescription: test.recommendation?.aiGeneralAdvice,
      recommendations: test.recommendation?.universities,
      profile: test.profile ?? null,
    };
  }

  async getTestById(id: string, userId: string) {
    const test = await this.testsRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['recommendation'],
    });

    if (!test) throw new RpcException('Test not found');

    return {
      testId: test.id,
      testName: test.testName,
      completedAt: test.completedAt,
      scores: test.profileScores,
      dominantTraits: test.dominantTraits,
      answers: test.answers,
      aiProfileDescription: test.recommendation?.aiGeneralAdvice,
      recommendations: test.recommendation?.universities,
      profile: test.profile ?? null,
    };
  }

  async updateTestName(id: string, userId: string, testName: string) {
    const test = await this.testsRepository.findOne({
      where: { id, user: { id: userId } },
    });
    if (!test) throw new RpcException('Test not found');

    test.testName = testName;
    await this.testsRepository.save(test);
    return {
      success: true,
      message: 'Test name updated',
      testName: test.testName,
    };
  }

  async deleteTestFromHistory(id: string, userId: string) {
    const test = await this.testsRepository.findOne({
      where: { id, user: { id: userId } },
    });
    if (!test) throw new RpcException('Test not found');

    await this.testsRepository.remove(test);
    return { success: true, message: 'Test deleted' };
  }

  // --- Career Simulators ---
  async getSimulators() {
    return this.careerSimulatorRepository.find({
      where: { status: 'activo' },
      select: [
        'id',
        'slug',
        'careerName',
        'steamArea',
        'estimatedDurationMinutes',
        'difficulty',
        'status',
        'colorToken',
        'icon',
        'shortDescription',
        'tags',
      ],
      order: { careerName: 'ASC' },
    });
  }

  async getAdminSimulators() {
    return this.careerSimulatorRepository.find({
      order: { updatedAt: 'DESC' },
    });
  }

  async getSimulatorBySlug(slug: string) {
    const simulator = await this.careerSimulatorRepository.findOne({
      where: { slug, status: 'activo' },
    });
    if (!simulator) throw new RpcException('Simulator not found');
    return simulator;
  }

  async createSimulator(data: Partial<CareerSimulator>) {
    const clean = this.normalizeSimulatorPayload(data);
    const duplicate = await this.careerSimulatorRepository.findOne({
      where: { slug: clean.slug },
    });
    if (duplicate)
      throw new RpcException('Ya existe un simulador con ese slug.');
    const sim = this.careerSimulatorRepository.create(clean);
    return this.careerSimulatorRepository.save(sim);
  }

  async updateSimulator(id: string, data: Partial<CareerSimulator>) {
    const simulator = await this.careerSimulatorRepository.findOne({
      where: { id },
    });
    if (!simulator) throw new RpcException('Simulator not found');

    const clean = this.normalizeSimulatorPayload({ ...simulator, ...data });
    const duplicate = await this.careerSimulatorRepository.findOne({
      where: { slug: clean.slug },
    });
    if (duplicate && duplicate.id !== id) {
      throw new RpcException('Ya existe otro simulador con ese slug.');
    }
    Object.assign(simulator, clean);
    return this.careerSimulatorRepository.save(simulator);
  }

  private normalizeSimulatorPayload(
    data: Partial<CareerSimulator>,
  ): Partial<CareerSimulator> & Pick<CareerSimulator, 'slug'> {
    const slug = String(data.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const requiredText: Array<[keyof CareerSimulator, string]> = [
      ['careerName', 'nombre de carrera'],
      ['steamArea', 'área STEAM'],
      ['difficulty', 'dificultad'],
      ['colorToken', 'color'],
      ['icon', 'icono'],
      ['shortDescription', 'descripción'],
    ];
    if (!slug) throw new RpcException('El slug del simulador es obligatorio.');
    for (const [key, label] of requiredText) {
      if (!String(data[key] || '').trim()) {
        throw new RpcException(`El ${label} del simulador es obligatorio.`);
      }
    }
    if (!Array.isArray(data.steps) || data.steps.length !== 6) {
      throw new RpcException('Un simulador debe tener exactamente 6 pasos.');
    }
    const expectedTypes = [
      'CONTEXT',
      'DATA_ANALYSIS',
      'TRADEOFF_DECISION',
      'SURPRISE_REVEAL',
      'REALITY_CHECK',
      'EMOTIONAL_REFLECTION',
    ];
    data.steps.forEach((step: any, index: number) => {
      const normalizedType =
        step?.type === 'AI_FEEDBACK' ? 'REALITY_CHECK' : step?.type;
      if (normalizedType !== expectedTypes[index]) {
        throw new RpcException(
          `El paso ${index + 1} debe ser de tipo ${expectedTypes[index]}.`,
        );
      }
      if (!String(step?.id || '').trim() || !String(step?.title || '').trim()) {
        throw new RpcException(`El paso ${index + 1} necesita id y título.`);
      }
      step.type = normalizedType;
    });

    return {
      slug,
      careerName: String(data.careerName).trim(),
      steamArea: String(data.steamArea).trim().toLowerCase(),
      estimatedDurationMinutes: Math.min(
        120,
        Math.max(1, Number(data.estimatedDurationMinutes) || 15),
      ),
      difficulty: String(data.difficulty).trim(),
      status: data.status === 'inactivo' ? 'inactivo' : 'activo',
      colorToken: String(data.colorToken).trim(),
      icon: String(data.icon).trim(),
      shortDescription: String(data.shortDescription).trim(),
      tags: Array.isArray(data.tags)
        ? data.tags
            .map((tag) => String(tag).trim())
            .filter(Boolean)
            .slice(0, 12)
        : [],
      steps: data.steps,
      completionConfig: data.completionConfig || null,
    };
  }

  async deleteSimulator(id: string) {
    const simulator = await this.careerSimulatorRepository.findOne({
      where: { id },
    });
    if (!simulator) throw new RpcException('Simulator not found');
    await this.careerSimulatorRepository.remove(simulator);
    return { success: true, message: 'Simulator deleted' };
  }

  // --- Complementary Tests ---
  async getComplementaryTest(testId: string) {
    const test = await this.compTestRepository.findOne({ where: { testId } });
    if (!test) throw new RpcException('Test not found');
    return test;
  }

  async createComplementaryTest(data: Partial<ComplementaryTest>) {
    const test = this.compTestRepository.create(data);
    return this.compTestRepository.save(test);
  }

  async submitComplementaryTest(userId: string, testId: string, answers: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    // Static logic for points can be executed here or expected from frontend.
    // We just save the result.
    const result = { answers, completedAt: new Date() };

    const history = this.userHistoryRepository.create({
      user,
      userId,
      activityType: 'COMPLEMENTARY_TEST',
      activityId: testId,
      results: result,
    });
    await this.userHistoryRepository.save(history);

    return { success: true, results: result };
  }

  // --- Calibration ---
  async submitCalibration(userId: string, moduleId: string, answers: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    // El frontend solo ofrece esta ruta tras completar el test vocacional
    // (missionUnlockGuard), pero eso es una gate puramente de UX: hay que
    // exigirlo también aquí, o cualquier usuario autenticado podría enviar
    // calibración directamente vía API sin haber hecho el test base.
    const hasCompletedTheoreticalTest = await this.testsRepository.exist({
      where: { user: { id: userId } },
    });
    if (!hasCompletedTheoreticalTest) {
      throw new RpcException(
        'Debes completar el test vocacional antes de acceder a la calibración.',
      );
    }

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
    return { success: true, calibration };
  }

  async getCalibration(userId: string) {
    return this.calibrationRepository.find({
      where: { user: { id: userId } },
      select: ['moduleId', 'answers', 'updatedAt'],
    });
  }

  /**
   * Métricas reales para el dashboard del admin: totales, actividad reciente,
   * y distribución de perfiles STEAM calculada sobre los tests completados.
   */
  async getAdminStats() {
    const AXES = [
      'ciencia',
      'tecnologia',
      'ingenieria',
      'artes',
      'matematicas',
    ];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [users, tests, totalSimulators, totalQuestions] = await Promise.all([
      this.userRepository.find({
        select: [
          'id',
          'fullname',
          'email',
          'role',
          'createdAt',
          'isBanned',
          'suspendedUntil',
        ],
      }),
      this.testsRepository.find({ relations: ['user'] }),
      this.careerSimulatorRepository.count(),
      this.questionRepository.count(),
    ]);

    const totalUsers = users.length;
    const totalAdmins = users.filter((u) => u.role === 'admin').length;
    const totalStudents = totalUsers - totalAdmins;
    const moderatedCount = users.filter(
      (u) =>
        u.isBanned || (u.suspendedUntil && new Date(u.suspendedUntil) > now),
    ).length;

    const totalTests = tests.length;
    const testsThisWeek = tests.filter(
      (t) => t.completedAt && new Date(t.completedAt) >= weekAgo,
    ).length;
    const testsThisMonth = tests.filter(
      (t) => t.completedAt && new Date(t.completedAt) >= monthAgo,
    ).length;

    // Distribución: eje dominante de cada test completado.
    const distribution: Record<string, number> = {
      ciencia: 0,
      tecnologia: 0,
      ingenieria: 0,
      artes: 0,
      matematicas: 0,
    };
    for (const t of tests) {
      const scores = t.profileScores || {};
      let topAxis: string | null = null;
      let topVal = -Infinity;
      for (const axis of AXES) {
        const v = Number(scores[axis] ?? 0);
        if (v > topVal) {
          topVal = v;
          topAxis = axis;
        }
      }
      if (topAxis && topVal > 0) distribution[topAxis]++;
    }

    // Actividad reciente: últimos 8 usuarios registrados con su último test.
    const latestTestByUser = new Map<string, VocationalTest>();
    for (const t of tests) {
      const uid = t.user?.id;
      if (!uid) continue;
      const prev = latestTestByUser.get(uid);
      if (!prev || new Date(t.completedAt) > new Date(prev.completedAt)) {
        latestTestByUser.set(uid, t);
      }
    }
    const recentUsers = [...users]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 8)
      .map((u) => {
        const lt = latestTestByUser.get(u.id);
        return {
          fullname: u.fullname,
          email: u.email,
          createdAt: u.createdAt,
          dominantTraits: lt?.dominantTraits || null,
          hasTest: !!lt,
        };
      });

    return {
      totals: {
        users: totalUsers,
        students: totalStudents,
        admins: totalAdmins,
        moderated: moderatedCount,
        tests: totalTests,
        testsThisWeek,
        testsThisMonth,
        simulators: totalSimulators,
        questions: totalQuestions,
      },
      distribution,
      recentUsers,
    };
  }
}
