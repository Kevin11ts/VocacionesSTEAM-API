import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TestsService } from './tests.service';

@Controller()
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @MessagePattern({ cmd: 'tests.get-questions' })
  async getQuestions() {
    return this.testsService.getQuestions();
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
