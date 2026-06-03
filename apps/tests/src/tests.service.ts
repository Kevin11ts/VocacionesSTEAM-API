import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User,
  VocationalTest,
  AiRecommendation,
  Question,
  Option,
  UserSettings,
  OtpCode,
  CreateQuestionDto,
  Simulator,
  SimulatorStep,
  SimulatorOption,
  ComplementaryTest,
  UserHistory,
  CalibrationResult,
} from '@app/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

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
    @InjectRepository(Simulator)
    private readonly simulatorRepository: Repository<Simulator>,
    @InjectRepository(SimulatorStep)
    private readonly simulatorStepRepository: Repository<SimulatorStep>,
    @InjectRepository(SimulatorOption)
    private readonly simulatorOptionRepository: Repository<SimulatorOption>,
    @InjectRepository(ComplementaryTest)
    private readonly compTestRepository: Repository<ComplementaryTest>,
    @InjectRepository(UserHistory)
    private readonly userHistoryRepository: Repository<UserHistory>,
    @InjectRepository(CalibrationResult)
    private readonly calibrationRepository: Repository<CalibrationResult>,
    @Inject('AI_SERVICE') private readonly aiClient: ClientProxy,
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

  async submitTest(
    userId: string,
    answers: Record<string, string>,
    locationInput?: string,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    let scores = this.calculateScores(answers);

    // Apply Calibration Results
    const calibrations = await this.calibrationRepository.find({
      where: { user: { id: userId } },
    });
    if (calibrations && calibrations.length > 0) {
      scores = this.applyCalibrationToScores(scores, calibrations);
    }

    const dominantTraits = this.getDominantTraits(scores);

    const testCount = await this.testsRepository.count({
      where: { user: { id: userId } },
    });
    const testName = `Test Vocacional ${testCount + 1}`;

    let test = this.testsRepository.create({
      user,
      testName,
      answers,
      profileScores: scores,
      dominantTraits,
    });
    test = await this.testsRepository.save(test);

    let aiResponse;
    try {
      this.logger.log(`Calling AI Service for Test ${test.id}`);
      aiResponse = await lastValueFrom(
        this.aiClient.send(
          { cmd: 'ai.generate-recommendations' },
          {
            locationInput,
            scores,
            studentName: user.fullname,
            dominantTraits,
          },
        ),
      );
    } catch (error) {
      this.logger.error('Failed to get AI recommendations', error);
      throw new RpcException('Failed to generate AI recommendations');
    }

    const recommendation = new AiRecommendation();
    recommendation.locationInput = locationInput || 'México';
    recommendation.aiGeneralAdvice = aiResponse.description;
    recommendation.universities = aiResponse.universities;
    test.recommendation = recommendation;

    await this.testsRepository.save(test);

    return {
      testId: test.id,
      scores,
      dominantTraits,
      aiProfileDescription: aiResponse.description,
      recommendations: aiResponse.universities,
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

  private calculateScores(
    answers: Record<string, string>,
  ): Record<string, number> {
    const scores = {
      ciencia: 0,
      tecnologia: 0,
      ingenieria: 0,
      arte: 0,
      matematicas: 0,
    };

    Object.values(answers).forEach((val) => {
      // Lógica simulada que mapea A, B, C, D a los rasgos STEAM basados en la frecuencia
      // En una aplicación real, se mapearía el ID de la pregunta al rasgo dominante.
      if (val === 'A') scores.ciencia++;
      else if (val === 'B') scores.tecnologia++;
      else if (val === 'C') scores.ingenieria++;
      else if (val === 'D') scores.arte++;
      else scores.matematicas++;
    });

    return scores;
  }

  private applyCalibrationToScores(
    scores: Record<string, number>,
    calibrations: CalibrationResult[],
  ): Record<string, number> {
    const adjustedScores = { ...scores };

    // Aquí se aplica la suma de los valores resultantes de los submódulos.
    // Asumiendo que los test de calibración pueden otorgar puntos extra a ciencias, tecnología, etc.
    // Dado que no se proporcionó una fórmula matemática exacta, sumamos valores por defecto o simulados.
    // TODO: Implementar el mapeo exacto de 'answers' a 'steamTraits' cuando se definan las reglas.

    for (const cal of calibrations) {
      if (cal.moduleId === 'gaming_habits') {
        adjustedScores.tecnologia += 2;
        adjustedScores.ingenieria += 1;
      } else if (cal.moduleId === 'physical_hobbies') {
        adjustedScores.ciencia += 2;
      } else if (cal.moduleId === 'digital_consumption') {
        adjustedScores.arte += 1;
      } else if (cal.moduleId === 'everyday_mechanics') {
        adjustedScores.ingenieria += 2;
        adjustedScores.matematicas += 1;
      }
    }
    return adjustedScores;
  }

  private getDominantTraits(scores: Record<string, number>): string {
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top1 = entries[0];
    const top2 = entries[1];

    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    if (top2[1] === 0) {
      return cap(top1[0]); // Si el segundo puntaje es 0, solo retorna el primero
    }

    return `${cap(top1[0])} + ${cap(top2[0])}`;
  }

  // --- Simulators ---
  async getSimulators() {
    return this.simulatorRepository.find({
      select: ['id', 'careerId', 'careerName', 'steamAreaName', 'description'],
    });
  }

  async getSimulatorById(id: string) {
    const simulator = await this.simulatorRepository.findOne({ where: { id } });
    if (!simulator) throw new RpcException('Simulator not found');
    return simulator; // Returns steps and feedbackRules
  }

  async createSimulator(data: Partial<Simulator>) {
    if (data.steps && data.steps.length !== 6) {
      throw new RpcException('Un simulador debe tener exactamente 6 pasos.');
    }
    const sim = this.simulatorRepository.create(data);
    return this.simulatorRepository.save(sim);
  }

  async updateSimulator(id: string, data: Partial<Simulator>) {
    const simulator = await this.simulatorRepository.findOne({ where: { id } });
    if (!simulator) throw new RpcException('Simulator not found');

    if (data.steps && data.steps.length !== 6) {
      throw new RpcException('Un simulador debe tener exactamente 6 pasos.');
    }

    // Usando save para manejar las relaciones (cascade: true)
    Object.assign(simulator, data);
    return this.simulatorRepository.save(simulator);
  }

  async deleteSimulator(id: string) {
    const simulator = await this.simulatorRepository.findOne({ where: { id } });
    if (!simulator) throw new RpcException('Simulator not found');
    await this.simulatorRepository.remove(simulator);
    return { success: true, message: 'Simulator deleted' };
  }

  async evaluateSimulator(
    userId: string,
    simulatorId: string,
    decisions: any[],
  ) {
    const simulator = await this.simulatorRepository.findOne({
      where: { id: simulatorId },
    }); // eager loads steps and options
    if (!simulator) throw new RpcException('Simulator not found');

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    // 1. Sumar los steamTraitWeight de las opciones elegidas.
    const aggregatedScores: Record<string, number> = {
      ciencia: 0,
      tecnologia: 0,
      ingenieria: 0,
      arte: 0,
      matematicas: 0,
    };

    const selectedOptionIds = decisions.map((d) => d.selectedOptionId);
    const totalPossibleScore = 0; // Para calcular afinidad máxima posible si se requiere

    // Asumiendo que `steps` y `options` son cargadas mediante Eager loading o Relation
    if (simulator.steps) {
      for (const step of simulator.steps) {
        if (step.options) {
          for (const opt of step.options) {
            if (
              selectedOptionIds.includes(opt.optionId) &&
              opt.steamTraitWeight
            ) {
              // Sumar los pesos
              for (const [trait, weight] of Object.entries(
                opt.steamTraitWeight,
              )) {
                if (typeof weight === 'number') {
                  aggregatedScores[trait.toLowerCase()] =
                    (aggregatedScores[trait.toLowerCase()] || 0) + weight;
                }
              }
            }
          }
        }
      }
    }

    // 2. Calcular una puntuación de afinidad. (Lógica simplificada: suma total de puntos)
    const affinityScore = Object.values(aggregatedScores).reduce(
      (a, b) => a + b,
      0,
    );

    // 3. Devolver textos predefinidos almacenados en la base de datos basados en el puntaje
    let matchedRule = null;
    if (simulator.feedbackRules && simulator.feedbackRules.length > 0) {
      // Ordenar reglas por puntaje mínimo requerido descendente para encontrar la más alta que cumple
      const sortedRules = [...simulator.feedbackRules].sort(
        (a, b) => (b.minScore || 0) - (a.minScore || 0),
      );
      for (const rule of sortedRules) {
        if (affinityScore >= (rule.minScore || 0)) {
          matchedRule = rule;
          break;
        }
      }
    }

    if (!matchedRule && simulator.feedbackRules?.length > 0) {
      matchedRule = simulator.feedbackRules[simulator.feedbackRules.length - 1]; // Fallback
    }

    const result = {
      feedbackMessage:
        matchedRule?.feedbackMessage ||
        'Completaste el simulador satisfactoriamente.',
      strengths: matchedRule?.strengths || [],
      areasForImprovement: matchedRule?.areasForImprovement || [],
      affinityScore: affinityScore,
      aggregatedScores: aggregatedScores, // Puntajes desglosados
    };

    // Save to UserHistory
    const history = this.userHistoryRepository.create({
      user,
      userId,
      activityType: 'SIMULATOR',
      activityId: simulatorId,
      results: result,
    });
    await this.userHistoryRepository.save(history);

    return result;
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
