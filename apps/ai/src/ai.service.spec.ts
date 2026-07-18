import { University } from '@app/common';
import { AiService } from './ai.service';

describe('AiService: descubrimiento cercano en segundo plano', () => {
  const university = {
    id: 'u1',
    name: 'Universidad Verificada',
    source: 'manual',
    location: { latitude: 18.88, longitude: -96.93 },
    steamPrograms: [{ name: 'Ingeniería de Software', area: 'tecnologia' }],
    programsVerifiedAt: new Date('2026-07-18T12:00:00.000Z'),
    updatedAt: new Date('2026-07-18T12:00:00.000Z'),
  } as University;

  function createService() {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'GROQ_API_KEY') return 'groq-test';
        if (key === 'GOOGLE_PLACES_API_KEY') return 'places-test';
        return undefined;
      }),
    };
    const universityRepository = {
      find: jest.fn().mockResolvedValue([university]),
      save: jest.fn(async (value) => value),
    };
    const aiLogRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = new AiService(
      config as never,
      aiLogRepository as never,
      universityRepository as never,
    );
    return { service, universityRepository, aiLogRepository };
  }

  it('responde con el snapshot inmediato y deduplica el trabajo por zona/radio', async () => {
    const { service } = createService();
    let finishJob!: () => void;
    const pendingJob = new Promise<{ settled: boolean }>((resolve) => {
      finishJob = () => resolve({ settled: false });
    });
    const pipeline = jest
      .spyOn(service as any, 'processNearbyDiscovery')
      .mockReturnValue(pendingJob);

    const first = await service.findOrDiscoverNearby(18.88, -96.93, 30);
    const second = await service.findOrDiscoverNearby(18.881, -96.931, 30);

    expect(first).toMatchObject({
      universities: [expect.objectContaining({ id: 'u1' })],
      processing: true,
      complete: false,
      coverageCount: 1,
      verifiedCount: 1,
    });
    expect(first.startedAt).toEqual(expect.any(String));
    expect(first.updatedAt).toEqual(expect.any(String));
    expect(second.startedAt).toBe(first.startedAt);
    expect(pipeline).toHaveBeenCalledTimes(1);

    finishJob();
    await (service as any).nearbyDiscoveryJobs.values().next().value.promise;

    const duringCooldown = await service.findOrDiscoverNearby(
      18.88,
      -96.93,
      30,
    );
    expect(duringCooldown.processing).toBe(false);
    expect(duringCooldown.complete).toBe(false);
    expect(duringCooldown.retryAt).toEqual(expect.any(String));
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it('registra la fecha del fallo para aplicar backoff en visitas posteriores', async () => {
    const { service, universityRepository } = createService();
    const failed = {
      ...university,
      aiEnrichedAt: null,
      aiEnrichmentStatus: null,
      aiEnrichmentError: null,
    } as University;

    await (service as any).markEnrichmentFailure(
      failed,
      new Error('sitio fuera de línea'),
    );

    expect(failed.aiEnrichmentStatus).toBe('failed');
    expect(failed.aiEnrichedAt).toBeInstanceOf(Date);
    expect((service as any).hasRecentEnrichmentFailure(failed)).toBe(true);
    expect(universityRepository.save).toHaveBeenCalledWith(failed);
  });

  it('ejecuta tres rondas aunque una ronda no aumente las verificadas', async () => {
    const { service } = createService();
    const incompleteSnapshot = [
      {
        ...university,
        steamPrograms: [],
        programsVerifiedAt: null,
        distanceKm: 0,
      },
    ];
    jest
      .spyOn(service, 'getNearbyUniversities')
      .mockResolvedValue(incompleteSnapshot);
    const round = jest
      .spyOn(service as any, 'processNearbyDiscoveryRound')
      .mockResolvedValue({ attempted: 1 });

    await (service as any).processNearbyDiscovery(18.88, -96.93, 30);

    expect(round).toHaveBeenCalledTimes(3);
    expect(round.mock.calls[0][6]).toBe(round.mock.calls[2][6]);
  });

  it('detiene las rondas cuando alcanza 15 instituciones verificadas', async () => {
    const { service } = createService();
    const incompleteSnapshot = [
      { ...university, steamPrograms: [], distanceKm: 0 },
    ];
    const completeSnapshot = Array.from({ length: 15 }, (_, index) => ({
      ...university,
      id: `verified-${index}`,
      distanceKm: index / 10,
    }));
    jest
      .spyOn(service, 'getNearbyUniversities')
      .mockResolvedValueOnce(incompleteSnapshot)
      .mockResolvedValueOnce(completeSnapshot);
    const round = jest
      .spyOn(service as any, 'processNearbyDiscoveryRound')
      .mockResolvedValue({ attempted: 1 });

    await (service as any).processNearbyDiscovery(18.88, -96.93, 30);

    expect(round).toHaveBeenCalledTimes(1);
    expect(service.getNearbyUniversities).toHaveBeenCalledTimes(2);
  });

  it('considera completa una zona real agotada aunque tenga menos de 15 campus', async () => {
    const { service } = createService();
    const pipeline = jest
      .spyOn(service as any, 'processNearbyDiscovery')
      .mockResolvedValue({ settled: true });

    await service.findOrDiscoverNearby(18.88, -96.93, 30);
    await (service as any).nearbyDiscoveryJobs.values().next().value.promise;
    const settled = await service.findOrDiscoverNearby(18.88, -96.93, 30);

    expect(settled.processing).toBe(false);
    expect(settled.complete).toBe(true);
    expect(settled.verifiedCount).toBe(1);
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it('marca la zona como agotada cuando una ronda ya no encuentra trabajo', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getNearbyUniversities').mockResolvedValue([
      {
        ...university,
        steamPrograms: [],
        programsVerifiedAt: null,
        distanceKm: 0,
      },
    ]);
    const round = jest
      .spyOn(service as any, 'processNearbyDiscoveryRound')
      .mockResolvedValue({ attempted: 0 });

    const outcome = await (service as any).processNearbyDiscovery(
      18.88,
      -96.93,
      30,
    );

    expect(outcome).toEqual({ settled: true });
    expect(round).toHaveBeenCalledTimes(1);
  });

  it('no declara completa una zona con trabajo diferido por backoff', async () => {
    const { service } = createService();
    const deferredUntil = Date.now() + 60_000;
    jest.spyOn(service, 'getNearbyUniversities').mockResolvedValue([
      {
        ...university,
        steamPrograms: [],
        programsVerifiedAt: null,
        distanceKm: 0,
      },
    ]);
    jest
      .spyOn(service as any, 'processNearbyDiscoveryRound')
      .mockResolvedValue({ attempted: 0, deferredUntil });

    const outcome = await (service as any).processNearbyDiscovery(
      18.88,
      -96.93,
      30,
    );

    expect(outcome).toEqual({ settled: false, deferredUntil });
  });

  it('recupera de ai_logs los Place IDs descartados para no repetir IA', async () => {
    const { service, aiLogRepository } = createService();
    aiLogRepository.find.mockResolvedValue([
      {
        detectedProfile:
          'descubrimiento cerca-de-ti: descartado (high_school); place_id=reject-1',
        createdAt: new Date(),
      },
    ]);

    const rejected = await (service as any).getRecentlyRejectedPlaceIds([
      'reject-1',
      'valid-1',
    ]);

    expect(rejected).toEqual(new Set(['reject-1']));
    expect(aiLogRepository.find).toHaveBeenCalledTimes(1);
  });
});
