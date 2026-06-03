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
  async updateQuestion(@Payload() payload: { id: string; data: any }) {
    return this.testsService.updateQuestion(payload.id, payload.data);
  }

  @MessagePattern({ cmd: 'tests.delete-question' })
  async deleteQuestion(@Payload() payload: { id: string }) {
    return this.testsService.deleteQuestion(payload.id);
  }

  @MessagePattern({ cmd: 'tests.submit' })
  async submitTest(
    @Payload()
    payload: {
      userId: string;
      answers: Record<string, string>;
      locationInput?: string;
    },
  ) {
    return this.testsService.submitTest(
      payload.userId,
      payload.answers,
      payload.locationInput,
    );
  }

  @MessagePattern({ cmd: 'tests.get-history' })
  async getTestHistory(@Payload() payload: { userId: string }) {
    return this.testsService.getTestHistory(payload.userId);
  }

  @MessagePattern({ cmd: 'tests.get-latest' })
  async getLatestTest(@Payload() payload: { userId: string }) {
    return this.testsService.getLatestTest(payload.userId);
  }

  @MessagePattern({ cmd: 'tests.get-by-id' })
  async getTestById(@Payload() payload: { id: string; userId: string }) {
    return this.testsService.getTestById(payload.id, payload.userId);
  }

  @MessagePattern({ cmd: 'tests.update-name' })
  async updateTestName(
    @Payload() payload: { id: string; userId: string; testName: string },
  ) {
    return this.testsService.updateTestName(
      payload.id,
      payload.userId,
      payload.testName,
    );
  }

  @MessagePattern({ cmd: 'tests.delete-test' })
  async deleteTestFromHistory(
    @Payload() payload: { id: string; userId: string },
  ) {
    return this.testsService.deleteTestFromHistory(payload.id, payload.userId);
  }

  // --- Simulators ---
  @MessagePattern({ cmd: 'tests.get-simulators' })
  async getSimulators() {
    return this.testsService.getSimulators();
  }

  @MessagePattern({ cmd: 'tests.get-simulator-by-id' })
  async getSimulatorById(@Payload() payload: { id: string }) {
    return this.testsService.getSimulatorById(payload.id);
  }

  @MessagePattern({ cmd: 'tests.create-simulator' })
  async createSimulator(@Payload() data: any) {
    return this.testsService.createSimulator(data);
  }

  @MessagePattern({ cmd: 'tests.update-simulator' })
  async updateSimulator(@Payload() payload: { id: string; data: any }) {
    return this.testsService.updateSimulator(payload.id, payload.data);
  }

  @MessagePattern({ cmd: 'tests.delete-simulator' })
  async deleteSimulator(@Payload() payload: { id: string }) {
    return this.testsService.deleteSimulator(payload.id);
  }

  @MessagePattern({ cmd: 'tests.evaluate-simulator' })
  async evaluateSimulator(
    @Payload()
    payload: {
      userId: string;
      simulatorId: string;
      decisions: any[];
    },
  ) {
    return this.testsService.evaluateSimulator(
      payload.userId,
      payload.simulatorId,
      payload.decisions,
    );
  }

  // --- Complementary Tests ---
  @MessagePattern({ cmd: 'tests.get-complementary-test' })
  async getComplementaryTest(@Payload() payload: { testId: string }) {
    return this.testsService.getComplementaryTest(payload.testId);
  }

  @MessagePattern({ cmd: 'tests.create-complementary-test' })
  async createComplementaryTest(@Payload() data: any) {
    return this.testsService.createComplementaryTest(data);
  }

  @MessagePattern({ cmd: 'tests.submit-complementary-test' })
  async submitComplementaryTest(
    @Payload() payload: { userId: string; testId: string; answers: any },
  ) {
    return this.testsService.submitComplementaryTest(
      payload.userId,
      payload.testId,
      payload.answers,
    );
  }

  // --- Calibration ---
  @MessagePattern({ cmd: 'tests.submit-calibration' })
  async submitCalibration(
    @Payload() payload: { userId: string; moduleId: string; answers: any },
  ) {
    return this.testsService.submitCalibration(
      payload.userId,
      payload.moduleId,
      payload.answers,
    );
  }

  @MessagePattern({ cmd: 'tests.get-calibration' })
  async getCalibration(@Payload() payload: { userId: string }) {
    return this.testsService.getCalibration(payload.userId);
  }
}
