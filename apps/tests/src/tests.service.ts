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

  async createQuestion(data: any) {
    const question = this.questionRepository.create(data);
    return this.questionRepository.save(question);
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

    // Si se envían nuevas opciones, TypeORM las actualizará por el cascade: true
    Object.assign(question, data);
    return this.questionRepository.save(question);
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
      select: [
        'id',
        'slug',
        'careerName',
        'steamArea',
        'difficulty',
        'status',
        'shortDescription',
        'tags',
      ],
    });
  }

  async getSimulatorBySlug(slug: string) {
    const simulator = await this.careerSimulatorRepository.findOne({
      where: { slug },
    });
    if (!simulator) throw new RpcException('Simulator not found');
    return simulator;
  }

  async createSimulator(data: Partial<CareerSimulator>) {
    if (data.steps && data.steps.length !== 6) {
      throw new RpcException('Un simulador debe tener exactamente 6 pasos.');
    }
    const sim = this.careerSimulatorRepository.create(data);
    return this.careerSimulatorRepository.save(sim);
  }

  async updateSimulator(id: string, data: Partial<CareerSimulator>) {
    const simulator = await this.careerSimulatorRepository.findOne({
      where: { id },
    });
    if (!simulator) throw new RpcException('Simulator not found');

    if (data.steps && data.steps.length !== 6) {
      throw new RpcException('Un simulador debe tener exactamente 6 pasos.');
    }

    Object.assign(simulator, data);
    return this.careerSimulatorRepository.save(simulator);
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
}
