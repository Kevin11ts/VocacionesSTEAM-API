import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, VocationalTest, AiRecommendation, Question, Option, UserSettings, OtpCode, CreateQuestionDto } from '@app/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class TestsService {
  private readonly logger = new Logger(TestsService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(VocationalTest) private readonly testsRepository: Repository<VocationalTest>,
    @InjectRepository(Question) private readonly questionRepository: Repository<Question>,
    @InjectRepository(Option) private readonly optionRepository: Repository<Option>,
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
    const question = await this.questionRepository.findOne({ where: { id }, relations: ['options'] });
    if (!question) throw new RpcException('Question not found');

    // Si se envían nuevas opciones, TypeORM las actualizará por el cascade: true
    Object.assign(question, data);
    return this.questionRepository.save(question);
  }

  async deleteQuestion(id: string) {
    const question = await this.questionRepository.findOne({ where: { id }, relations: ['options'] });
    if (!question) throw new RpcException('Question not found');
    await this.questionRepository.remove(question);
    return { success: true, message: 'Question deleted' };
  }

  async submitTest(userId: string, answers: Record<string, string>, locationInput?: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    const scores = this.calculateScores(answers);
    const dominantTraits = this.getDominantTraits(scores);

    let test = this.testsRepository.create({
      user,
      answers,
      profileScores: scores,
      dominantTraits,
    });
    test = await this.testsRepository.save(test);

    let aiResponse;
    try {
      this.logger.log(`Calling AI Service for Test ${test.id}`);
      aiResponse = await lastValueFrom(
        this.aiClient.send({ cmd: 'ai.generate-recommendations' }, { locationInput, scores })
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

  private calculateScores(answers: Record<string, string>): Record<string, number> {
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

  private getDominantTraits(scores: Record<string, number>): string {
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top1 = entries[0][0];
    const top2 = entries[1][0];
    
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(top1)} + ${cap(top2)}`;
  }
}
