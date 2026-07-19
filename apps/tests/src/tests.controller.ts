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
import { CalibrationDeckService } from './calibration-deck.service';
import { MotorVocacionalService } from './motor/motor-vocacional.service';
import { SystemAdminService } from './system-admin.service';
import { CalibrationDeck } from '@app/common';

@Controller()
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
    private readonly catalogService: CatalogService,
    private readonly profileService: ProfileService,
    private readonly calibrationDeckService: CalibrationDeckService,
    private readonly motorVocacionalService: MotorVocacionalService,
    private readonly systemAdminService: SystemAdminService,
  ) {}

  // --- Motor Vocacional API remoto (A0-A8, obra independiente) ---
  @MessagePattern({ cmd: 'tests.motor-compute-profile' })
  async motorComputeProfile(
    @Payload()
    payload: {
      userId: string;
      request: ProfileComputationRequest;
    },
  ) {
    return this.motorVocacionalService.computeProfileRemote(
      payload.userId,
      payload.request,
    );
  }

  @MessagePattern({ cmd: 'tests.motor-get-runs' })
  async motorGetRuns(@Payload() payload: { userId: string; limit?: number }) {
    return this.motorVocacionalService.getRuns(payload.userId, payload.limit);
  }

  @MessagePattern({ cmd: 'tests.motor-get-metrics' })
  async motorGetMetrics() {
    return this.motorVocacionalService.getMetrics();
  }

  // --- Flujo canónico de perfil: Motor Vocacional FastAPI (A1-A7) ---
  @MessagePattern({ cmd: 'tests.compute-profile' })
  async computeProfile(
    @Payload()
    payload: {
      userId: string;
      request: ProfileComputationRequest;
    },
  ) {
    return this.motorVocacionalService.computeProfileForApplication(
      payload.userId,
      payload.request,
    );
  }

  @MessagePattern({ cmd: 'tests.submit-calibration-recompute' })
  async submitCalibrationAndRecompute(
    @Payload()
    payload: {
      userId: string;
      moduleId: string;
      answers: Array<{ axis: SteamAxis; liked: boolean }>;
    },
  ) {
    return this.motorVocacionalService.submitCalibrationAndRecompute(
      payload.userId,
      payload.moduleId,
      payload.answers,
    );
  }

  @MessagePattern({ cmd: 'tests.get-simulator-results' })
  async getSimulatorResults(@Payload() payload: { userId: string }) {
    return this.profileService.getSimulatorResults(payload.userId);
  }

  @MessagePattern({ cmd: 'tests.submit-simulator' })
  async submitSimulatorAndRecompute(
    @Payload()
    payload: {
      userId: string;
      careerSlug: string;
      decisions: any[];
      biasFlags?: {
        too_fast: boolean;
        linear_pattern_detected: boolean;
      };
    },
  ) {
    return this.motorVocacionalService.submitSimulatorAndRecompute(
      payload.userId,
      payload.careerSlug,
      payload.decisions,
      payload.biasFlags,
    );
  }

  @MessagePattern({ cmd: 'tests.get-questions' })
  async getQuestions() {
    return this.testsService.getActiveQuestions();
  }

  @MessagePattern({ cmd: 'tests.admin-get-questions' })
  async getAdminQuestions() {
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
    const { test, profile } =
      await this.motorVocacionalService.computeAndPersistProfile(
        payload.userId,
        {
          theoreticalAnswers: payload.answers,
          locationInput: payload.locationInput,
        },
      );

    return {
      testId: test.id,
      scores: profile.steamScores,
      dominantTraits: test.dominantTraits,
      aiProfileDescription: profile.profileSummary,
      recommendations: [],
      profile,
    };
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

  @MessagePattern({ cmd: 'tests.admin-get-simulators' })
  async getAdminSimulators() {
    return this.testsService.getAdminSimulators();
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

  @MessagePattern({ cmd: 'tests.admin-stats' })
  async getAdminStats() {
    return this.testsService.getAdminStats();
  }

  @MessagePattern({ cmd: 'tests.admin-system-overview' })
  async getAdminSystemOverview() {
    return this.systemAdminService.getOverview();
  }

  @MessagePattern({ cmd: 'tests.admin-clear-cache' })
  async clearAdminOperationalCache() {
    return this.systemAdminService.clearOperationalCache();
  }

  @MessagePattern({ cmd: 'tests.admin-cleanup-orphan-options' })
  async cleanupAdminOrphanOptions() {
    return this.systemAdminService.cleanupOrphanOptions();
  }

  // --- Decks de calibración (swipe) ---
  @MessagePattern({ cmd: 'calibration.decks-active' })
  async getActiveDecks() {
    return this.calibrationDeckService.getActiveDecks();
  }

  @MessagePattern({ cmd: 'calibration.deck-by-module' })
  async getDeckByModule(@Payload() payload: { moduleId: string }) {
    return this.calibrationDeckService.getDeckByModuleId(payload.moduleId);
  }

  @MessagePattern({ cmd: 'calibration.decks-all' })
  async getAllDecks() {
    return this.calibrationDeckService.getAllDecks();
  }

  @MessagePattern({ cmd: 'calibration.deck-create' })
  async createDeck(@Payload() data: Partial<CalibrationDeck>) {
    return this.calibrationDeckService.createDeck(data);
  }

  @MessagePattern({ cmd: 'calibration.deck-update' })
  async updateDeck(
    @Payload() payload: { id: string; data: Partial<CalibrationDeck> },
  ) {
    return this.calibrationDeckService.updateDeck(payload.id, payload.data);
  }

  @MessagePattern({ cmd: 'calibration.deck-delete' })
  async deleteDeck(@Payload() payload: { id: string }) {
    return this.calibrationDeckService.deleteDeck(payload.id);
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
  async updateAxisMeta(@Payload() payload: { axis: SteamAxis; data: any }) {
    return this.catalogService.updateAxisMeta(payload.axis, payload.data);
  }
}
