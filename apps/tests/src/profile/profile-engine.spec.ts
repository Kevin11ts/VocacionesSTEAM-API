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
  computeCalibrationVector,
  computeSimulatorAffinity,
  computeSimulatorVector,
  deriveBiasFlags,
  clamp,
} from './profile-engine';
import { CalibrationModuleResult } from '@app/common';
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

  describe('A2 — Vector de calibración', () => {
    // Módulo §13: ciencia 2L, tecnologia 1L, ingenieria 1L, artes 1D, matematicas 1D
    const modulo13: CalibrationModuleResult = {
      moduleId: 'gaming_habits',
      answers: [
        { axis: 'ciencia', liked: true },
        { axis: 'ciencia', liked: true },
        { axis: 'tecnologia', liked: true },
        { axis: 'ingenieria', liked: true },
        { axis: 'artes', liked: false },
        { axis: 'matematicas', liked: false },
      ],
    };

    it('reproduce el vector §13: {80, 65, 65, 42, 42}', () => {
      expect(computeCalibrationVector([modulo13])).toEqual({
        ciencia: 80,
        tecnologia: 65,
        ingenieria: 65,
        artes: 42,
        matematicas: 42,
      });
    });

    it('omite ejes sin ninguna carta (RG-9)', () => {
      const vector = computeCalibrationVector([
        {
          moduleId: 'm1',
          answers: [{ axis: 'ingenieria', liked: true }],
        },
      ]);
      expect(vector).toEqual({ ingenieria: 65 });
      expect(vector).not.toHaveProperty('ciencia');
    });

    it('sin módulos devuelve null', () => {
      expect(computeCalibrationVector([])).toBeNull();
    });

    it('acumula señal a través de varios módulos', () => {
      const vector = computeCalibrationVector([
        { moduleId: 'm1', answers: [{ axis: 'artes', liked: true }] },
        { moduleId: 'm2', answers: [{ axis: 'artes', liked: true }] },
      ]);
      expect(vector).toEqual({ artes: 80 }); // 50 + 2*15
    });
  });

  describe('A3a — Afinidad de un simulador', () => {
    // Escenario de ACEPTACIÓN §5: primaryScore=90, sin sesgos, tiempo ≥20s.
    // Pesos: ciencia acumula 10 (máximo) y tecnologia 9 → normalizado 90.
    const steps = [
      {
        id: 's1',
        type: 'DATA_ANALYSIS',
        options: [
          {
            id: 'o1',
            steamTraitWeight: { ciencia: 10, tecnologia: 9 },
          },
          { id: 'o2', steamArea: 'A' },
        ],
      },
    ];
    const baseInput = {
      careerSlug: 'software',
      careerName: 'Ingeniería de Software',
      steamAreaName: 'Tecnología',
      steps,
      decisions: [
        {
          stepId: 's1',
          stepType: 'DATA_ANALYSIS',
          selectedOptionId: 'o1',
          timeSpentMs: 20000,
        },
      ],
      biasFlags: { too_fast: false, linear_pattern_detected: false },
    };

    it('primaryScore=90, tiempo ≥20s, sin sesgos → affinity 90', () => {
      const { result } = computeSimulatorAffinity(baseInput);
      expect(result.affinity).toBe(90);
      expect(result.axis).toBe('tecnologia');
    });

    it('con sesgo lineal descuenta 15 → 75, confianza medium', () => {
      const { result, feedback } = computeSimulatorAffinity({
        ...baseInput,
        biasFlags: { too_fast: false, linear_pattern_detected: true },
      });
      expect(result.affinity).toBe(75);
      expect(feedback.confidence_level).toBe('medium');
    });

    it('con ambos sesgos descuenta 25, confianza low', () => {
      const { result, feedback } = computeSimulatorAffinity({
        ...baseInput,
        biasFlags: { too_fast: true, linear_pattern_detected: true },
      });
      expect(result.affinity).toBe(65);
      expect(feedback.confidence_level).toBe('low');
    });

    it('sin decisiones puntuables usa primaryScore=60', () => {
      const { result } = computeSimulatorAffinity({
        ...baseInput,
        decisions: [{ stepId: 'sX', timeSpentMs: 20000 }],
      });
      // 60 * (0.7 + 0.3 * min(1, 20/20)) = 60
      expect(result.affinity).toBe(60);
    });

    it('opción sin steamTraitWeight pero con steamArea suma +10 al eje mapeado', () => {
      const { result } = computeSimulatorAffinity({
        ...baseInput,
        steamAreaName: 'Artes',
        decisions: [
          {
            stepId: 's1',
            stepType: 'DATA_ANALYSIS',
            selectedOptionId: 'o2',
            timeSpentMs: 20000,
          },
        ],
      });
      expect(result.axis).toBe('artes');
      expect(result.affinity).toBe(100); // artes es el único eje: normaliza a 100
    });

    it('acota la afinidad al mínimo 10 (clamp especial 10-100)', () => {
      const { result } = computeSimulatorAffinity({
        ...baseInput,
        steamAreaName: 'Artes', // eje sin acumulación → primary 0
        biasFlags: { too_fast: true, linear_pattern_detected: true },
      });
      expect(result.affinity).toBe(10);
    });
  });

  describe('A3a — Derivación de banderas de sesgo', () => {
    const steps = [
      {
        id: 's1',
        type: 'DATA_ANALYSIS',
        options: [{ id: 'a' }, { id: 'b' }],
      },
      {
        id: 's2',
        type: 'TRADEOFF_DECISION',
        options: [{ id: 'a' }, { id: 'b' }],
      },
      {
        id: 's3',
        type: 'DATA_ANALYSIS',
        options: [{ id: 'a' }, { id: 'b' }],
      },
    ];

    it('too_fast si algún paso tomó menos de 3 segundos', () => {
      const flags = deriveBiasFlags(
        [{ stepId: 's1', timeSpentMs: 2000 }],
        steps,
      );
      expect(flags.too_fast).toBe(true);
    });

    it('linear_pattern si el mismo índice se repite ≥70% en 3+ decisiones', () => {
      const flags = deriveBiasFlags(
        [
          {
            stepId: 's1',
            stepType: 'DATA_ANALYSIS',
            selectedOptionId: 'a',
            timeSpentMs: 10000,
          },
          {
            stepId: 's2',
            stepType: 'TRADEOFF_DECISION',
            selectedOptionId: 'a',
            timeSpentMs: 10000,
          },
          {
            stepId: 's3',
            stepType: 'DATA_ANALYSIS',
            selectedOptionId: 'a',
            timeSpentMs: 10000,
          },
        ],
        steps,
      );
      expect(flags.linear_pattern_detected).toBe(true);
      expect(flags.too_fast).toBe(false);
    });
  });

  describe('A3b — Agregación de simuladores', () => {
    it('reproduce §13: un simulador tecnologia 82 → {tecnologia: 82}', () => {
      expect(
        computeSimulatorVector([
          { careerSlug: 'software', axis: 'tecnologia', affinity: 82 },
        ]),
      ).toEqual({ tecnologia: 82 });
    });

    it('promedia varios simuladores del mismo eje y omite el resto (RG-9)', () => {
      const vector = computeSimulatorVector([
        { careerSlug: 'software', axis: 'tecnologia', affinity: 82 },
        { careerSlug: 'ia', axis: 'tecnologia', affinity: 71 },
        { careerSlug: 'medicina', axis: 'ciencia', affinity: 60 },
      ]);
      expect(vector).toEqual({ tecnologia: 77, ciencia: 60 }); // (82+71)/2 = 76.5 → 77
    });

    it('sin simuladores devuelve null', () => {
      expect(computeSimulatorVector([])).toBeNull();
    });
  });

  describe('Pipeline completo §13 (A1+A2+A3 → A4)', () => {
    it('reproduce el vector final exacto desde las entradas crudas', () => {
      const a1 = computeTheoreticalVector(rawTeorico);
      const a2 = computeCalibrationVector([
        {
          moduleId: 'gaming_habits',
          answers: [
            { axis: 'ciencia', liked: true },
            { axis: 'ciencia', liked: true },
            { axis: 'tecnologia', liked: true },
            { axis: 'ingenieria', liked: true },
            { axis: 'artes', liked: false },
            { axis: 'matematicas', liked: false },
          ],
        },
      ]);
      const a3 = computeSimulatorVector([
        { careerSlug: 'software', axis: 'tecnologia', affinity: 82 },
      ]);
      const final = blendVectors(a1, a2, a3);
      expect(final).toEqual({
        ciencia: 65,
        tecnologia: 87,
        ingenieria: 51,
        artes: 34,
        matematicas: 52,
      });
      expect(computeDominantAxes(final)).toEqual([
        'tecnologia',
        'ciencia',
        'matematicas',
        'ingenieria',
        'artes',
      ]);
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

    it('suma +1 al steamTrait usando el ID estable de la opción', () => {
      const questions = [
        {
          id: 'q1',
          options: [
            { id: 'q1-a', letter: 'A', steamTrait: 'ciencia' },
            { id: 'q1-b', letter: 'B', steamTrait: 'arte' },
          ],
        },
        {
          id: 'q2',
          options: [
            { id: 'q2-a', letter: 'A', steamTrait: 'tecnologia' },
            { id: 'q2-b', letter: 'B', steamTrait: 'matematicas' },
          ],
        },
      ];
      const raw = countAnswersByAxis({ q1: 'q1-b', q2: 'q2-a' }, questions);
      expect(raw).toEqual({
        ciencia: 0,
        tecnologia: 1,
        ingenieria: 0,
        artes: 1, // 'arte' legacy contó para 'artes'
        matematicas: 0,
      });
    });

    it('sigue aceptando letras de resultados históricos', () => {
      const raw = countAnswersByAxis({ q1: 'A' }, [
        {
          id: 'q1',
          options: [{ id: 'option-1', letter: 'A', steamTrait: 'ciencia' }],
        },
      ]);
      expect(raw.ciencia).toBe(1);
    });

    it('ignora respuestas sin pregunta u opción correspondiente', () => {
      const raw = countAnswersByAxis({ inexistente: 'A', q1: 'Z' }, [
        { id: 'q1', options: [{ letter: 'A', steamTrait: 'ciencia' }] },
      ]);
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
