import { Controller } from '@nestjs/common';
import {
  CreateQuestionDto,
  ProfileComputationRequest,
  SteamAxis,
} from '@app/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TestsService } from './tests.service';
import { CatalogService } from './profile/catalog.service';
import { ProfileService } from './profile/profile.service';

@Controller()
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
    private readonly catalogService: CatalogService,
    private readonly profileService: ProfileService,
  ) {}

  // --- Motor de perfil vocacional (A1-A7) ---
  @MessagePattern({ cmd: 'tests.compute-profile' })
  async computeProfile(
    @Payload()
    payload: {
      userId: string;
      request: ProfileComputationRequest;
    },
  ) {
    return this.profileService.computeProfile(payload.userId, payload.request);
  }

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

  // --- Career Simulators ---
  @MessagePattern({ cmd: 'tests.get-simulators' })
  async getSimulators() {
    return this.testsService.getSimulators();
  }

  @MessagePattern({ cmd: 'tests.get-simulator-by-slug' })
  async getSimulatorBySlug(@Payload() payload: { slug: string }) {
    return this.testsService.getSimulatorBySlug(payload.slug);
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

  // --- Catálogos de vocaciones/carreras (A6/A7) ---
  @MessagePattern({ cmd: 'tests.get-catalogs' })
  async getCatalogs() {
    return this.catalogService.getFullCatalog();
  }

  @MessagePattern({ cmd: 'tests.create-vocation' })
  async createVocation(@Payload() data: any) {
    return this.catalogService.createVocation(data);
  }

  @MessagePattern({ cmd: 'tests.update-vocation' })
  async updateVocation(@Payload() payload: { id: string; data: any }) {
    return this.catalogService.updateVocation(payload.id, payload.data);
  }

  @MessagePattern({ cmd: 'tests.delete-vocation' })
  async deleteVocation(@Payload() payload: { id: string }) {
    return this.catalogService.deleteVocation(payload.id);
  }

  @MessagePattern({ cmd: 'tests.create-career-item' })
  async createCareerItem(@Payload() data: any) {
    return this.catalogService.createCareer(data);
  }

  @MessagePattern({ cmd: 'tests.update-career-item' })
  async updateCareerItem(@Payload() payload: { id: string; data: any }) {
    return this.catalogService.updateCareer(payload.id, payload.data);
  }

  @MessagePattern({ cmd: 'tests.delete-career-item' })
  async deleteCareerItem(@Payload() payload: { id: string }) {
    return this.catalogService.deleteCareer(payload.id);
  }

  @MessagePattern({ cmd: 'tests.update-axis-meta' })
  async updateAxisMeta(
    @Payload() payload: { axis: SteamAxis; data: any },
  ) {
    return this.catalogService.updateAxisMeta(payload.axis, payload.data);
  }
}
