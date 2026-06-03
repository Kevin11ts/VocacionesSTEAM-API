import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

describe('AiController', () => {
  let aiController: AiController;
  let aiService: AiService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        {
          provide: AiService,
          useValue: {
            generateRecommendations: jest.fn(),
          },
        },
      ],
    }).compile();

    aiController = app.get<AiController>(AiController);
    aiService = app.get<AiService>(AiService);
  });

  describe('generateRecommendations', () => {
    it('should call aiService.generateRecommendations with the correct arguments', async () => {
      const payload = {
        locationInput: 'Ciudad de México',
        scores: { math: 90, science: 85 },
        studentName: 'John Doe',
        dominantTraits: 'Creative, Logical',
      };

      const expectedResult = { recommendations: ['Engineering', 'Physics'] };
      jest
        .spyOn(aiService, 'generateRecommendations')
        .mockResolvedValue(expectedResult as any);

      const result = await aiController.generateRecommendations(payload);

      expect(aiService.generateRecommendations).toHaveBeenCalledWith(
        payload.locationInput,
        payload.scores,
        payload.studentName,
        payload.dominantTraits,
      );
      expect(result).toEqual(expectedResult);
    });
  });
});
