import { Controller } from '@nestjs/common';
import { CreateQuestionDto } from '@app/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TestsService } from './tests.service';

@Controller()
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @MessagePattern({ cmd: 'tests.get-questions' })
  async getQuestions() {
    return this.testsService.getQuestions();
  }

  @MessagePattern({ cmd: 'tests.create-question' })
  async createQuestion(@Payload() data: any) {
    return this.testsService.createQuestion(data);
  }

  @MessagePattern({ cmd: 'tests.create-bulk-questions' })
  async createBulkQuestions(@Payload() data: CreateQuestionDto[]) {
    return this.testsService.createBulkQuestions(data);
  }

  @MessagePattern({ cmd: 'tests.update-question' })
  async updateQuestion(@Payload() payload: { id: string, data: any }) {
    return this.testsService.updateQuestion(payload.id, payload.data);
  }

  @MessagePattern({ cmd: 'tests.delete-question' })
  async deleteQuestion(@Payload() payload: { id: string }) {
    return this.testsService.deleteQuestion(payload.id);
  }

  @MessagePattern({ cmd: 'tests.submit' })
  async submitTest(
    @Payload() payload: { 
      userId: string;
      answers: Record<string, string>;
      locationInput?: string; 
    }
  ) {
    return this.testsService.submitTest(payload.userId, payload.answers, payload.locationInput);
  }
}
