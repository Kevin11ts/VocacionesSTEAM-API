import {
  haversineKm,
  costBonus,
  computeBaseScore,
  findOfferedCareer,
  validateAiMatches,
  applyFiltersAndSort,
  MAX_DISTANCE_KM,
} from './university-match.engine';
import { UniversityCandidate, UniversityMatch } from '@app/common';

describe('A8 — Capa determinista del matching de universidades', () => {
  describe('haversineKm', () => {
    it('distancia 0 entre el mismo punto', () => {
      const p = { lat: 19.4326, lng: -99.1332 };
      expect(haversineKm(p, p)).toBe(0);
    });

    it('Zócalo CDMX → Ángel de la Independencia ≈ 3-4 km', () => {
      const d = haversineKm(
        { lat: 19.4326, lng: -99.1332 },
        { lat: 19.427, lng: -99.1677 },
      );
      expect(d).toBeGreaterThan(3);
      expect(d).toBeLessThan(4.5);
    });
  });

  describe('costBonus', () => {
    it('+15 si coincide con la preferencia', () => {
      expect(costBonus('public', 'public')).toBe(15);
      expect(costBonus('affordable', 'affordable')).toBe(15);
    });
    it('+7 para opciones accesibles sin coincidencia exacta', () => {
      expect(costBonus('public', 'any')).toBe(7);
      expect(costBonus('affordable', 'any')).toBe(7);
      expect(costBonus('affordable', 'public')).toBe(7);
      expect(costBonus('public', 'affordable')).toBe(7);
    });
    it('+0 para premium no pedido', () => {
      expect(costBonus('private-premium', 'any')).toBe(0);
      expect(costBonus('private-premium', 'public')).toBe(0);
    });
  });

  describe('computeBaseScore', () => {
    it('máximo teórico: distancia 0, preferencia coincidente, rating 5 → 100', () => {
      expect(
        computeBaseScore({
          distanceKm: 0,
          costTier: 'public',
          costPreference: 'public',
          rating: 5,
        }),
      ).toBe(100);
    });

    it('a distancia máxima el bono de cercanía es 0', () => {
      expect(
        computeBaseScore({
          distanceKm: MAX_DISTANCE_KM,
          costTier: 'private-premium',
          costPreference: 'any',
          rating: null,
        }),
      ).toBe(50);
    });

    it('sin rating no suma calidad', () => {
      const withRating = computeBaseScore({
        distanceKm: 50,
        costTier: 'public',
        costPreference: 'any',
        rating: 5,
      });
      const withoutRating = computeBaseScore({
        distanceKm: 50,
        costTier: 'public',
        costPreference: 'any',
      });
      expect(withRating - withoutRating).toBe(10);
    });
  });

  describe('findOfferedCareer (match duro)', () => {
    const uni = {
      steamPrograms: [
        { name: 'Ingeniería en Software', area: 'tecnologia' },
        { name: 'Actuaría', area: 'matematicas' },
      ],
    };

    it('encuentra la carrera aunque cambien acentos y mayúsculas', () => {
      expect(
        findOfferedCareer(uni, [
          { careerName: 'ingenieria en software' },
        ]),
      ).toBe('ingenieria en software');
    });

    it('devuelve la primera carrera de A7 que la universidad ofrece', () => {
      expect(
        findOfferedCareer(uni, [
          { careerName: 'Medicina' },
          { careerName: 'Actuaría' },
        ]),
      ).toBe('Actuaría');
    });

    it('null (exclusión) si no ofrece ninguna carrera recomendada', () => {
      expect(findOfferedCareer(uni, [{ careerName: 'Arquitectura' }])).toBe(
        null,
      );
      expect(
        findOfferedCareer({ steamPrograms: [] }, [{ careerName: 'Actuaría' }]),
      ).toBe(null);
    });
  });

  describe('validateAiMatches (anti-alucinación y ±10)', () => {
    const candidates = [
      { universityId: 'u1', baseScore: 80 },
      { universityId: 'u2', baseScore: 60 },
    ] as UniversityCandidate[];

    it('acota el ajuste de la IA a baseScore ± 10', () => {
      const validated = validateAiMatches(
        [
          { universityId: 'u1', matchScore: 99, explanation: 'x' }, // +19 → cap +10
          { universityId: 'u2', matchScore: 45, explanation: 'y' }, // -15 → cap -10
        ],
        candidates,
      );
      expect(validated['u1'].matchScore).toBe(90);
      expect(validated['u2'].matchScore).toBe(50);
    });

    it('descarta universidades que no estaban en la lista', () => {
      const validated = validateAiMatches(
        [{ universityId: 'inventada', matchScore: 95, explanation: 'z' }],
        candidates,
      );
      expect(validated).toEqual({});
    });

    it('sin matchScore numérico usa el baseScore', () => {
      const validated = validateAiMatches(
        [{ universityId: 'u1', explanation: 'sin score' }],
        candidates,
      );
      expect(validated['u1'].matchScore).toBe(80);
    });
  });

  describe('applyFiltersAndSort (filtros sin IA)', () => {
    const matches: UniversityMatch[] = [
      {
        universityId: 'lejos',
        name: 'Lejana',
        matchedCareer: 'X',
        matchScore: 95,
        distanceKm: 80,
        costTier: 'public',
        explanation: '',
      },
      {
        universityId: 'premium',
        name: 'Premium',
        matchedCareer: 'X',
        matchScore: 88,
        distanceKm: 10,
        costTier: 'private-premium',
        explanation: '',
      },
      {
        universityId: 'publica',
        name: 'Pública',
        matchedCareer: 'X',
        matchScore: 88,
        distanceKm: 12,
        costTier: 'public',
        explanation: '',
      },
    ];

    it('filtra por distancia máxima', () => {
      const out = applyFiltersAndSort(matches, {
        maxDistanceKm: 25,
        costPreference: 'any',
      });
      expect(out.map((m) => m.universityId)).not.toContain('lejos');
    });

    it('en empate de score gana la más accesible (regla anti-sesgo 9)', () => {
      const out = applyFiltersAndSort(matches, {
        maxDistanceKm: 25,
        costPreference: 'any',
      });
      expect(out[0].universityId).toBe('publica');
      expect(out[1].universityId).toBe('premium');
    });

    it('preferencia public excluye de la lista lo no público', () => {
      const out = applyFiltersAndSort(matches, {
        maxDistanceKm: 100,
        costPreference: 'public',
      });
      expect(out.every((m) => m.costTier === 'public')).toBe(true);
    });
  });
});
