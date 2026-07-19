import { RpcException } from '@nestjs/microservices';
import { VocationalProfile } from '@app/common';
import { MotorVocacionalService } from './motor-vocacional.service';

const PROFILE = {
  steamScores: {
    ciencia: 100,
    tecnologia: 0,
    ingenieria: 0,
    artes: 0,
    matematicas: 0,
  },
  dominantAxes: ['ciencia', 'tecnologia'],
  profileName: 'Perfil Científico',
  profileArchetype: 'Investigador',
  profileSummary: 'Perfil calculado por FastAPI',
  calibration: {
    level: 55,
    confidence: 'inicial',
    calibrationModulesCompleted: 0,
    simulatorsCompleted: 0,
    explanation: 'Base teórica',
  },
  contributions: [],
  strengths: [],
  workStyle: [],
  recommendedVocations: [],
  recommendedCareers: [],
  nextSteps: [],
  generatedAt: '2026-07-19T12:00:00.000Z',
  profileVersion: '1.0.0',
} as VocationalProfile;

describe('MotorVocacionalService', () => {
  const originalFetch = global.fetch;
  let runRepository: any;
  let profileService: any;
  let service: MotorVocacionalService;

  beforeEach(() => {
    runRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'run-1', ...value })),
    };
    profileService = {
      loadStoredCalibrations: jest.fn().mockResolvedValue([]),
      loadStoredSimulatorResults: jest.fn().mockResolvedValue([]),
      persistComputedProfile: jest.fn().mockResolvedValue({
        id: 'test-1',
        dominantTraits: 'Ciencia + Tecnologia',
      }),
      getLatestComputationRequest: jest.fn(),
      updateLatestComputedProfile: jest.fn(),
      saveCalibration: jest.fn(),
      saveSimulatorResult: jest.fn(),
    };
    const questionRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'q1',
          options: [{ letter: 'A', steamTrait: 'ciencia' }],
        },
      ]),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'MOTOR_VOCACIONAL_URL') return 'https://motor.example/';
        if (key === 'MOTOR_VOCACIONAL_API_KEY') return 'private-key';
        return fallback;
      }),
    };
    const catalogService = {
      getVocationCatalog: jest.fn().mockResolvedValue({ ciencia: [] }),
      getCareerCatalog: jest.fn().mockResolvedValue({ ciencia: [] }),
    };
    service = new MotorVocacionalService(
      runRepository,
      questionRepository as never,
      configService as never,
      catalogService as never,
      profileService,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uses FastAPI in the application flow and persists both run and history', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          algorithm: 'A0',
          version: '1.0.0',
          executionTimeMs: 3.5,
          algorithmBreakdown: [{ algorithm: 'A1', executionTimeMs: 0.1 }],
          profile: PROFILE,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      service.computeProfileForApplication('user-1', {
        theoreticalAnswers: { q1: 'A' },
      }),
    ).resolves.toEqual(PROFILE);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://motor.example/v1/profile/compute',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': 'private-key' }),
      }),
    );
    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(requestBody.theoreticalCounts).toEqual({
      ciencia: 1,
      tecnologia: 0,
      ingenieria: 0,
      artes: 0,
      matematicas: 0,
    });
    expect(runRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        algorithm: 'A0',
        userId: 'user-1',
        result: PROFILE,
      }),
    );
    expect(profileService.persistComputedProfile).toHaveBeenCalledWith(
      'user-1',
      { theoreticalAnswers: { q1: 'A' } },
      PROFILE,
    );
  });

  it('recomputes the latest history through FastAPI after new evidence', async () => {
    profileService.getLatestComputationRequest.mockResolvedValue({
      theoreticalAnswers: { q1: 'A' },
    });
    profileService.updateLatestComputedProfile.mockResolvedValue(PROFILE);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          algorithm: 'A0',
          version: '1.0.0',
          executionTimeMs: 2,
          algorithmBreakdown: [],
          profile: PROFILE,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(service.recomputeLatestProfile('user-1')).resolves.toBe(
      PROFILE,
    );
    expect(profileService.updateLatestComputedProfile).toHaveBeenCalledWith(
      'user-1',
      PROFILE,
    );
    expect(runRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does not silently fall back to the duplicated engine if FastAPI fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));

    await expect(
      service.computeProfileForApplication('user-1', {
        theoreticalAnswers: { q1: 'A' },
      }),
    ).rejects.toBeInstanceOf(RpcException);
    expect(runRepository.save).not.toHaveBeenCalled();
    expect(profileService.persistComputedProfile).not.toHaveBeenCalled();
  });
});
