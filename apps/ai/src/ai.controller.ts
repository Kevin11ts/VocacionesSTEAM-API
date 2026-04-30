import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AiService } from './ai.service';

@Controller()
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  @MessagePattern({ cmd: 'ai.generate-recommendations' })
  async generateRecommendations(
    @Payload()
    payload: {
      locationInput: string;
      scores: Record<string, number>;
    },
  ) {
    return this.aiService.generateRecommendations(
      payload.locationInput,
      payload.scores,
    );
  }
}
