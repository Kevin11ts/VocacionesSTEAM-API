import {
  computeTheoreticalVector,
  blendVectors,
  computeDominantAxes,
  computeCalibrationState,
  buildNarrative,
  clamp,
} from './profile-engine';
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
