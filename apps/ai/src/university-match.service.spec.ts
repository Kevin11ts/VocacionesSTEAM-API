import { University } from '@app/common';
import { UniversityMatchService } from './university-match.service';

describe('UniversityMatchService: respuesta progresiva y radio', () => {
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
});
