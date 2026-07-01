import {
  computeTheoreticalVector,
  blendVectors,
  computeDominantAxes,
  computeCalibrationState,
  buildNarrative,
  affinityFor,
  recommendVocations,
  recommendCareers,
  normalizeAxisKey,
  countAnswersByAxis,
  clamp,
} from './profile-engine';
import {
  DEFAULT_VOCATION_CATALOG,
  DEFAULT_CAREER_CATALOG,
} from './catalog-seed';
import { SteamVector } from '@app/common';

/**
 * Vectores de prueba de la sección 13 del mandato de implementación.
 * Si estos tests no pasan, la implementación está mal (no se despliega).
 */
describe('Motor vocacional — Vectores de prueba (mandato §13)', () => {
  // Entrada del caso de prueba
  const rawTeorico = {
    ciencia: 4,
    tecnologia: 7,
    ingenieria: 3,
    artes: 2,
    matematicas: 4,
  };

  // Vectores intermedios esperados (§13)
  const a1Esperado: SteamVector = {
    ciencia: 57,
    tecnologia: 100,
    ingenieria: 43,
    artes: 29,
    matematicas: 57,
  };
  const a2Vector: Partial<SteamVector> = {
    ciencia: 80,
    tecnologia: 65,
    ingenieria: 65,
    artes: 42,
    matematicas: 42,
  };
  const a3Vector: Partial<SteamVector> = { tecnologia: 82 };

  describe('A1 — Vector teórico', () => {
    it('reproduce el vector §13 con max=7', () => {
      expect(computeTheoreticalVector(rawTeorico)).toEqual(a1Esperado);
    });

    it('deja el eje más elegido exactamente en 100', () => {
      const v = computeTheoreticalVector({ ciencia: 12, tecnologia: 3 });
      expect(v.ciencia).toBe(100);
    });

    it('con todos los conteos en 0 devuelve vector en 0 (max=1 evita división por cero)', () => {
      expect(computeTheoreticalVector({})).toEqual({
        ciencia: 0,
        tecnologia: 0,
        ingenieria: 0,
        artes: 0,
        matematicas: 0,
      });
    });
  });

  describe('A4 — Fusión ponderada', () => {
    it('reproduce el vector final §13: {65, 87, 51, 34, 52}', () => {
      const final = blendVectors(a1Esperado, a2Vector, a3Vector);
      expect(final).toEqual({
        ciencia: 65,
        tecnologia: 87,
        ingenieria: 51,
        artes: 34,
        matematicas: 52,
      });
    });

    it('ordena los ejes dominantes como §13', () => {
      const final = blendVectors(a1Esperado, a2Vector, a3Vector);
      expect(computeDominantAxes(final)).toEqual([
        'tecnologia',
        'ciencia',
        'matematicas',
        'ingenieria',
        'artes',
      ]);
    });

    it('eje solo con teórico devuelve el valor del teórico intacto (renormalización)', () => {
      const final = blendVectors(a1Esperado, null, null);
      expect(final).toEqual(a1Esperado);
    });

    it('renormaliza por eje aunque otras fuentes existan en otros ejes', () => {
      // artes sin señal de calibración ni simulador: (0.55*29)/0.55 = 29
      const final = blendVectors(a1Esperado, { ciencia: 80 }, a3Vector);
      expect(final.artes).toBe(29);
    });
  });

  describe('A5 — Medidor de calibración', () => {
    it('reproduce §13: 1 módulo + 1 simulador → level 72, en_calibracion', () => {
      const cal = computeCalibrationState(1, 1);
      expect(cal.level).toBe(72);
      expect(cal.confidence).toBe('en_calibracion');
      expect(cal.calibrationModulesCompleted).toBe(1);
      expect(cal.simulatorsCompleted).toBe(1);
    });

    it('solo test teórico → 55, inicial', () => {
      const cal = computeCalibrationState(0, 0);
      expect(cal.level).toBe(55);
      expect(cal.confidence).toBe('inicial');
    });

    it('umbral calibrado en 75 (2 módulos = 75)', () => {
      expect(computeCalibrationState(2, 0).confidence).toBe('calibrado');
    });

    it('umbral altamente_calibrado en 90 (2 módulos + 3 sims = 96)', () => {
      expect(computeCalibrationState(2, 3).confidence).toBe(
        'altamente_calibrado',
      );
    });

    it('acota a 100 (RG-6)', () => {
      expect(computeCalibrationState(10, 10).level).toBe(100);
    });
  });

  describe('Narrativa (plantillas deterministas)', () => {
    const finalScores: SteamVector = {
      ciencia: 65,
      tecnologia: 87,
      ingenieria: 51,
      artes: 34,
      matematicas: 52,
    };
    const dominant = computeDominantAxes(finalScores);
    const cal = computeCalibrationState(1, 1);

    it('§13: diferencia 22 > 15 → NO híbrido: "Perfil Tecnológico" / "Creador Digital"', () => {
      const n = buildNarrative(dominant, finalScores, cal);
      expect(n.profileName).toBe('Perfil Tecnológico');
      expect(n.profileArchetype).toBe('Creador Digital');
    });

    it('diferencia ≤15 → híbrido con adjetivos de ambos ejes', () => {
      const scores: SteamVector = {
        ciencia: 80,
        tecnologia: 87,
        ingenieria: 51,
        artes: 34,
        matematicas: 52,
      };
      const n = buildNarrative(computeDominantAxes(scores), scores, cal);
      expect(n.profileName).toBe('Perfil Tecnológico–Científico');
      expect(n.profileArchetype).toBe('Creador Digital Investigador');
    });
  });

  describe('A6/A7 — Afinidades de recomendación', () => {
    const finalScores: SteamVector = {
      ciencia: 65,
      tecnologia: 87,
      ingenieria: 51,
      artes: 34,
      matematicas: 52,
    };
    const dominant = computeDominantAxes(finalScores);

    it('§13: afinidades de los 3 ejes dominantes = 86, 67, 56', () => {
      expect(affinityFor('tecnologia', finalScores)).toBe(86);
      expect(affinityFor('ciencia', finalScores)).toBe(67);
      expect(affinityFor('matematicas', finalScores)).toBe(56);
    });

    it('A6 devuelve exactamente 4 vocaciones ordenadas por afinidad desc', () => {
      const vocations = recommendVocations(
        dominant,
        finalScores,
        DEFAULT_VOCATION_CATALOG,
      );
      expect(vocations).toHaveLength(4);
      // 3 del eje tecnologia (86) y la 4ª del segundo eje dominante (ciencia, 67)
      expect(vocations.slice(0, 3).every((v) => v.axis === 'tecnologia')).toBe(
        true,
      );
      expect(vocations.slice(0, 3).every((v) => v.affinity === 86)).toBe(true);
      expect(vocations[3].axis).toBe('ciencia');
      expect(vocations[3].affinity).toBe(67);
    });

    it('A7 devuelve exactamente 5 carreras con rationale del eje', () => {
      const careers = recommendCareers(
        dominant,
        finalScores,
        DEFAULT_CAREER_CATALOG,
      );
      expect(careers).toHaveLength(5);
      expect(careers.slice(0, 3).every((c) => c.affinity === 86)).toBe(true);
      expect(careers.slice(3).every((c) => c.affinity === 67)).toBe(true);
      expect(careers[0].rationale).toBe(
        'Encaja con tu fuerte afinidad en Tecnología: aprendes herramientas nuevas con facilidad y disfrutas automatizar y construir soluciones digitales.',
      );
    });

    it('los catálogos semilla cumplen el mínimo de 3 por eje (mandato §11)', () => {
      for (const axis of Object.keys(DEFAULT_VOCATION_CATALOG)) {
        expect(DEFAULT_VOCATION_CATALOG[axis].length).toBeGreaterThanOrEqual(3);
        expect(DEFAULT_CAREER_CATALOG[axis].length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Mapeo de respuestas a conteos (entrada de A1)', () => {
    it('normaliza claves de eje al contrato RG-5', () => {
      expect(normalizeAxisKey('arte')).toBe('artes'); // dato legacy en BD
      expect(normalizeAxisKey('Artes')).toBe('artes');
      expect(normalizeAxisKey('Matemáticas')).toBe('matematicas');
      expect(normalizeAxisKey('Tecnología')).toBe('tecnologia');
      expect(normalizeAxisKey('otracosa')).toBeNull();
    });

    it('suma +1 al steamTrait de la opción elegida por pregunta', () => {
      const questions = [
        {
          id: 'q1',
          options: [
            { letter: 'A', steamTrait: 'ciencia' },
            { letter: 'B', steamTrait: 'arte' },
          ],
        },
        {
          id: 'q2',
          options: [
            { letter: 'A', steamTrait: 'tecnologia' },
            { letter: 'B', steamTrait: 'matematicas' },
          ],
        },
      ];
      const raw = countAnswersByAxis({ q1: 'B', q2: 'A' }, questions);
      expect(raw).toEqual({
        ciencia: 0,
        tecnologia: 1,
        ingenieria: 0,
        artes: 1, // 'arte' legacy contó para 'artes'
        matematicas: 0,
      });
    });

    it('ignora respuestas sin pregunta u opción correspondiente', () => {
      const raw = countAnswersByAxis(
        { inexistente: 'A', q1: 'Z' },
        [{ id: 'q1', options: [{ letter: 'A', steamTrait: 'ciencia' }] }],
      );
      expect(Object.values(raw).every((v) => v === 0)).toBe(true);
    });
  });

  describe('clamp (RG-6)', () => {
    it('redondeo estándar: 0.5 sube', () => {
      expect(clamp(86.5)).toBe(87);
      expect(clamp(86.4)).toBe(86);
    });
    it('acota a [0, 100]', () => {
      expect(clamp(-5)).toBe(0);
      expect(clamp(105)).toBe(100);
    });
  });
});
