import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UniversityMatchRequest } from '@app/common';
import { AiService } from './ai.service';
import { UniversityMatchService } from './university-match.service';

@Controller()
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly universityMatchService: UniversityMatchService,
  ) {}

  /**
   * A8 — Matching de universidades (única llamada a IA del sistema).
   * El perfil vocacional (A1-A7) es 100% determinista y vive en apps/tests.
   */
  @MessagePattern({ cmd: 'ai.match-universities' })
  async matchUniversities(
    @Payload()
    payload: {
      userId: string;
      request: UniversityMatchRequest;
    },
  ) {
    return this.universityMatchService.matchUniversities(
      payload.userId,
      payload.request,
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

  @MessagePattern({ cmd: 'ai.delete-all-universities' })
  async deleteAllUniversities() {
    return this.aiService.deleteAllUniversities();
  }

  @MessagePattern({ cmd: 'ai.bulk-create-universities' })
  async bulkCreateUniversities(@Payload() rows: any[]) {
    return this.aiService.bulkCreateUniversities(rows);
  }

  @MessagePattern({ cmd: 'ai.discover-universities' })
  async discoverUniversities(@Payload() payload: { states?: string[] }) {
    return this.aiService.discoverUniversities(payload?.states);
  }

  @MessagePattern({ cmd: 'ai.discover-universities-denue' })
  async discoverFromDenue(@Payload() payload: { states: string[] }) {
    return this.aiService.discoverFromDenue(payload?.states);
  }

  @MessagePattern({ cmd: 'ai.cleanup-junk-universities' })
  async cleanupJunkUniversities() {
    return this.aiService.cleanupJunkUniversities();
  }

  @MessagePattern({ cmd: 'ai.enrich-universities' })
  async enrichUniversitiesWithAi(
    @Payload() payload: { limit?: number; filter?: string },
  ) {
    return this.aiService.enrichUniversitiesWithAi(
      payload?.limit,
      payload?.filter,
    );
  }
}
