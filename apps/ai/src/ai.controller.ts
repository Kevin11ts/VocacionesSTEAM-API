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
      studentName: string;
      dominantTraits: string;
    },
  ) {
    return this.aiService.generateRecommendations(
      payload.locationInput,
      payload.scores,
      payload.studentName,
      payload.dominantTraits,
    );
  }

  @MessagePattern({ cmd: 'ai.get-logs-stats' })
  async getLogsStats() {
    return this.aiService.getLogsStats();
  }

  // --- Universities ---
  @MessagePattern({ cmd: 'ai.get-universities' })
  async getUniversities() {
    return this.aiService.getUniversities();
  }

  @MessagePattern({ cmd: 'ai.create-university' })
  async createUniversity(@Payload() data: any) {
    return this.aiService.createUniversity(data);
  }

  @MessagePattern({ cmd: 'ai.update-university' })
  async updateUniversity(@Payload() payload: { id: string; data: any }) {
    return this.aiService.updateUniversity(payload.id, payload.data);
  }

  @MessagePattern({ cmd: 'ai.delete-university' })
  async deleteUniversity(@Payload() payload: { id: string }) {
    await this.aiService.deleteUniversity(payload.id);
    return { success: true };
  }
}
