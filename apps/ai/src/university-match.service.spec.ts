import { University } from '@app/common';
import { UniversityMatchService } from './university-match.service';

describe('UniversityMatchService: respuesta progresiva y radio', () => {
  const baseUniversity = {
    id: 'near',
    name: 'Universidad Cercana',
    source: 'manual',
    location: { latitude: 18.93, longitude: -96.93 },
    steamPrograms: [{ name: 'Ingeniería de Software', area: 'tecnologia' }],
    costTier: 'affordable',
  } as University;

  it('devuelve el ranking determinista sin esperar a Groq y excluye lo que queda fuera del radio elegido', async () => {
    const universities = [
      {
        id: 'near',
        name: 'Universidad Cercana',
        source: 'manual',
        location: { latitude: 18.93, longitude: -96.93 },
        steamPrograms: [{ name: 'Ingeniería de Software', area: 'tecnologia' }],
        costTier: 'affordable',
      },
      {
        id: 'near-2',
        name: 'Universidad Cercana Dos',
        source: 'manual',
        location: { latitude: 18.94, longitude: -96.93 },
        steamPrograms: [{ name: 'Ingeniería de Software', area: 'tecnologia' }],
        costTier: 'public',
      },
      {
        id: 'far',
        name: 'Universidad Lejana',
        source: 'manual',
        location: { latitude: 19.15, longitude: -96.93 },
        steamPrograms: [{ name: 'Ingeniería de Software', area: 'tecnologia' }],
        costTier: 'affordable',
      },
    ] as University[];
    const config = {
      get: jest.fn((key: string) =>
        key === 'GROQ_API_KEY' ? 'test-key' : undefined,
      ),
    };
    const service = new UniversityMatchService(
      config as never,
      { find: jest.fn().mockResolvedValue(universities) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
    );
    const backgroundJob = jest
      .spyOn(service as never, 'requestAiAdjustments' as never)
      // Permanece pendiente: si matchUniversities volviera a esperarla, esta
      // prueba agotaría el timeout en vez de entregar el ranking inicial.
      .mockImplementation(() => new Promise(() => undefined) as never);

    const response = await service.matchUniversities('user-1', {
      recommendedCareers: [
        { careerName: 'Ingeniería de Software', axis: 'tecnologia' },
      ],
      userLocation: { lat: 18.88, lng: -96.93 },
      filters: { maxDistanceKm: 10, costPreference: 'any' },
    });

    expect(response.matches.map((match) => match.universityId).sort()).toEqual([
      'near',
      'near-2',
    ]);
    expect(response.aiProcessing).toBe(true);
    expect(response.aiProvider).toBe('deterministic');
    expect(backgroundJob).toHaveBeenCalledTimes(1);
    expect(backgroundJob.mock.calls[0][1]).toHaveLength(2);
  });

  it('programa el reintento de una caché parcial sin exigir que el usuario recargue', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'GROQ_API_KEY' ? 'test-key' : undefined,
      ),
    };
    const cacheRepository = {
      findOne: jest.fn().mockResolvedValue({
        aiAdjustments: {
          near: {
            matchScore: 90,
            explanation: 'Explicación parcial disponible.',
          },
        },
        provider: 'Groq-partial',
        updatedAt: new Date(),
      }),
    };
    const service = new UniversityMatchService(
      config as never,
      { find: jest.fn().mockResolvedValue([baseUniversity]) } as never,
      cacheRepository as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
    );
    const backgroundJob = jest.spyOn(
      service as never,
      'requestAiAdjustments' as never,
    );
    const retryWait = jest
      .spyOn(service as never, 'waitForAiRetry' as never)
      // El job diferido queda vivo, pero la prueba no abre un timer real.
      .mockImplementation(() => new Promise(() => undefined) as never);

    const response = await service.matchUniversities('user-1', {
      recommendedCareers: [
        { careerName: 'Ingeniería de Software', axis: 'tecnologia' },
      ],
      userLocation: { lat: 18.88, lng: -96.93 },
      filters: { maxDistanceKm: 10, costPreference: 'any' },
    });

    expect(response.aiAnalyzedCount).toBe(1);
    expect(response.aiProvider).toBe('Groq (parcial)');
    expect(response.aiProcessing).toBe(true);
    expect(retryWait).toHaveBeenCalledWith(expect.any(Number));
    expect(backgroundJob).not.toHaveBeenCalled();
  });

  it('publica la caché parcial al terminar cada oleada y luego la marca completa', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'GROQ_API_KEY' ? 'test-key' : undefined,
      ),
    };
    const service = new UniversityMatchService(
      config as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service as any, 'callGroq').mockResolvedValue({
      text: JSON.stringify({
        matches: [
          {
            universityId: 'near',
            matchScore: 88,
            explanation: 'Afinidad validada.',
            matchedCareer: 'Ingeniería de Software',
            matchedProgram: 'Ingeniería de Software',
          },
        ],
      }),
      tokens: 10,
    });
    const upsert = jest
      .spyOn(service as any, 'upsertCache')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'saveLog').mockResolvedValue(undefined);

    await (service as any).requestAiAdjustments(
      'user-1',
      [
        {
          universityId: 'near',
          name: 'Universidad Cercana',
          offersCareer: 'Ingeniería de Software',
          matchType: 'direct',
          matchedProgram: 'Ingeniería de Software',
          distanceKm: 5,
          costTier: 'affordable',
          baseScore: 80,
          steamPrograms: [
            { name: 'Ingeniería de Software', area: 'tecnologia' },
          ],
        },
      ],
      [{ careerName: 'Ingeniería de Software', axis: 'tecnologia' }],
      ['tecnologia'],
      80,
      {
        userLocation: { lat: 18.88, lng: -96.93 },
        filters: { maxDistanceKm: 10, costPreference: 'any' },
      },
      'cache-key',
    );

    expect(upsert.mock.calls.map((call) => call[3])).toEqual([
      'Groq-partial',
      'Groq',
    ]);
  });

  it('conserva los ajustes parciales si el proveedor falla durante el reintento', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'GROQ_API_KEY' ? 'test-key' : undefined,
      ),
    };
    const service = new UniversityMatchService(
      config as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service as any, 'callGroq')
      .mockRejectedValue(new Error('proveedor temporalmente fuera de línea'));
    const upsert = jest
      .spyOn(service as any, 'upsertCache')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'saveLog').mockResolvedValue(undefined);

    const existing = {
      near: {
        matchScore: 90,
        explanation: 'Explicación parcial que debe preservarse.',
        matchedCareer: 'Ingeniería de Software',
        matchedProgram: 'Ingeniería de Software',
      },
    };
    const result = await (service as any).requestAiAdjustments(
      'user-1',
      [
        {
          universityId: 'near',
          name: 'Universidad Cercana',
          offersCareer: 'Ingeniería de Software',
          matchType: 'direct',
          matchedProgram: 'Ingeniería de Software',
          distanceKm: 5,
          costTier: 'affordable',
          baseScore: 80,
          steamPrograms: [
            { name: 'Ingeniería de Software', area: 'tecnologia' },
          ],
        },
        {
          universityId: 'pending',
          name: 'Universidad Pendiente',
          offersCareer: 'Ingeniería de Software',
          matchType: 'area',
          matchedProgram: 'Tecnologías de la Información',
          distanceKm: 8,
          costTier: 'public',
          baseScore: 75,
          steamPrograms: [
            { name: 'Tecnologías de la Información', area: 'tecnologia' },
          ],
        },
      ],
      [{ careerName: 'Ingeniería de Software', axis: 'tecnologia' }],
      ['tecnologia'],
      80,
      {
        userLocation: { lat: 18.88, lng: -96.93 },
        filters: { maxDistanceKm: 10, costPreference: 'any' },
      },
      'cache-key',
      existing,
    );

    expect(result).toEqual({ adjustments: existing, provider: 'Groq-partial' });
    expect(upsert).toHaveBeenLastCalledWith(
      'user-1',
      'cache-key',
      existing,
      'Groq-partial',
    );
  });

  it('invalida la clave cuando cambia la versión o contexto real del perfil', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new UniversityMatchService(
      config as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const request = {
      userLocation: { lat: 18.88, lng: -96.93 },
      filters: { maxDistanceKm: 10, costPreference: 'any' as const },
    };
    const careers = [
      {
        careerName: 'Ingeniería de Software',
        axis: 'tecnologia' as const,
      },
    ];
    const candidates = [
      {
        universityId: 'near',
        name: 'Universidad Cercana',
        offersCareer: 'Ingeniería de Software',
        matchType: 'direct' as const,
        matchedProgram: 'Ingeniería de Software',
        distanceKm: 5,
        costTier: 'affordable' as const,
        baseScore: 80,
        steamPrograms: [{ name: 'Ingeniería de Software', area: 'tecnologia' }],
      },
    ];

    const first = (service as any).buildCacheKey(
      request,
      careers,
      candidates,
      ['tecnologia'],
      80,
      'test-1',
    );
    const changedProfile = (service as any).buildCacheKey(
      request,
      careers,
      candidates,
      ['tecnologia'],
      60,
      'test-2',
    );
    const changedCostFilter = (service as any).buildCacheKey(
      {
        ...request,
        filters: { ...request.filters, costPreference: 'public' },
      },
      careers,
      candidates,
      ['tecnologia'],
      80,
      'test-1',
    );

    expect(changedProfile).not.toBe(first);
    expect(changedCostFilter).toBe(first);
  });
});
