import {
  SteamAxis,
  SteamVector,
  CalibrationState,
  CalibrationModuleResult,
  CareerRecommendation,
  ConfidenceLevel,
  NextStep,
  ProfileStrength,
  SimulatorAffinityResult,
  SimulatorBiasFlags,
  SimulatorDecisionInput,
  SimulatorFeedbackResponse,
  VocationRecommendation,
  CALIBRATION_GAINS,
  SOURCE_WEIGHTS,
  STEAM_AXES,
} from '@app/common';

/**
 * ============================================================================
 *  MOTOR DE PERFIL VOCACIONAL — FUNCIONES PURAS (A1, A4, A5 + narrativa)
 * ============================================================================
 *
 * Réplica exacta del motor local del frontend
 * (`vocational-profile.service.ts` de la PWA), según el mandato de
 * implementación. Determinista: mismo input → mismo output (RG-1).
 * Sin IA, sin aleatoriedad, sin timestamps en el cálculo (RG-2).
 */

export const AXES: SteamAxis[] = STEAM_AXES;

/** clamp(x) = max(0, min(100, round(x))). Redondeo estándar, 0.5 sube (RG-6). */
export function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function emptyVector(): SteamVector {
  return { ciencia: 0, tecnologia: 0, ingenieria: 0, artes: 0, matematicas: 0 };
}

/**
 * Normaliza una clave de eje a la forma canónica RG-5 (sin acentos, en
 * minúscula, plural para artes/matemáticas). Los datos legacy de la BD usan
 * 'arte' (singular) en Option.steamTrait; aquí se corrige.
 */
export function normalizeAxisKey(value: string): SteamAxis | null {
  const v = (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (v === 'ciencia' || v === 'ciencias') return 'ciencia';
  if (v === 'tecnologia') return 'tecnologia';
  if (v === 'ingenieria') return 'ingenieria';
  if (v === 'arte' || v === 'artes') return 'artes';
  if (v === 'matematica' || v === 'matematicas') return 'matematicas';
  return null;
}

// ===========================================================================
//  A1 — Vector teórico
// ===========================================================================

/** Forma mínima de una pregunta con opciones para contar respuestas. */
export interface QuestionForCounting {
  id: string;
  options?: Array<{ letter: string; steamTrait: string }> | null;
}

/**
 * Convierte las respuestas { [questionId]: letra } en el conteo crudo por
 * eje que consume A1: cada respuesta suma +1 al steamTrait de la opción
 * elegida. Respuestas sin pregunta u opción correspondiente se ignoran.
 */
export function countAnswersByAxis(
  answers: Record<string, string>,
  questions: QuestionForCounting[],
): Record<SteamAxis, number> {
  const raw: Record<SteamAxis, number> = {
    ciencia: 0,
    tecnologia: 0,
    ingenieria: 0,
    artes: 0,
    matematicas: 0,
  };
  const byId = new Map(questions.map((q) => [String(q.id), q]));
  for (const [questionId, letter] of Object.entries(answers || {})) {
    const question = byId.get(String(questionId));
    if (!question?.options) continue;
    const option = question.options.find(
      (o) => o.letter?.toUpperCase() === String(letter).toUpperCase(),
    );
    if (!option) continue;
    const axis = normalizeAxisKey(option.steamTrait);
    if (axis) raw[axis]++;
  }
  return raw;
}

/**
 * Convierte los conteos crudos por eje del test teórico a un vector 0-100
 * relativo al MÁXIMO (no a la suma): el eje más elegido queda en 100.
 */
export function computeTheoreticalVector(
  raw: Record<string, number>,
): SteamVector {
  const vector = emptyVector();
  const max = Math.max(1, ...AXES.map((a) => raw[a] || 0));
  for (const axis of AXES) {
    vector[axis] = Math.round(((raw[axis] || 0) / max) * 100);
  }
  return vector;
}

// ===========================================================================
//  A2 — Vector de calibración (swipes)
// ===========================================================================

export const CALIBRACION_LIKE = 15;
export const CALIBRACION_DISLIKE = 8;
export const CALIBRACION_NEUTRAL = 50;

/**
 * Convierte los likes/dislikes de los módulos en un vector PARCIAL:
 * clamp(50 + likes*15 - dislikes*8) por eje con señal. Los ejes sin
 * ninguna carta se OMITEN, no se ponen en 0 ni 50 (RG-9).
 */
export function computeCalibrationVector(
  results: CalibrationModuleResult[],
): Partial<SteamVector> | null {
  if (!results?.length) return null;
  const counts: Record<SteamAxis, { liked: number; disliked: number }> = {
    ciencia: { liked: 0, disliked: 0 },
    tecnologia: { liked: 0, disliked: 0 },
    ingenieria: { liked: 0, disliked: 0 },
    artes: { liked: 0, disliked: 0 },
    matematicas: { liked: 0, disliked: 0 },
  };
  for (const mod of results) {
    for (const ans of mod.answers || []) {
      const axis = normalizeAxisKey(ans.axis);
      if (!axis) continue;
      if (ans.liked) counts[axis].liked++;
      else counts[axis].disliked++;
    }
  }
  const vector: Partial<SteamVector> = {};
  for (const axis of AXES) {
    const c = counts[axis];
    if (c.liked === 0 && c.disliked === 0) continue; // sin señal: se omite
    vector[axis] = clamp(
      CALIBRACION_NEUTRAL +
        c.liked * CALIBRACION_LIKE -
        c.disliked * CALIBRACION_DISLIKE,
    );
  }
  return Object.keys(vector).length ? vector : null;
}

// ===========================================================================
//  A3a — Afinidad de UN simulador (baño de realidad)
// ===========================================================================

export const SIM_TIME_CAP_SEG = 20;
export const SIM_BIAS_LINEAL = 15;
export const SIM_BIAS_RAPIDO = 10;
export const SIM_BASE_SIN_DATOS = 60;

/** Mapeo de área corta S/T/E/A/M al eje canónico. */
const AXIS_MAP: Record<string, SteamAxis> = {
  S: 'ciencia',
  T: 'tecnologia',
  E: 'ingenieria',
  A: 'artes',
  M: 'matematicas',
};

/** Forma mínima de los pasos del simulador que consume A3a. */
export interface SimulatorStepForScoring {
  id: string;
  type?: string;
  options?: Array<{
    id: string;
    steamArea?: string;
    steamTraitWeight?: Record<string, number>;
  }> | null;
}

/** Eje principal de la carrera a partir del nombre de área STEAM. */
export function axisFromAreaName(steamAreaName: string): SteamAxis {
  const area = (steamAreaName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (area.includes('ciencia')) return 'ciencia';
  if (area.includes('tecnologia')) return 'tecnologia';
  if (area.includes('ingenieria')) return 'ingenieria';
  if (area.includes('arte')) return 'artes';
  if (area.includes('matematica')) return 'matematicas';
  return 'tecnologia';
}

/**
 * Deriva las banderas de sesgo desde las decisiones crudas cuando el
 * cliente no las envía. Réplica de la detección del frontend:
 * - too_fast: algún paso respondido en menos de 3 segundos.
 * - linear_pattern: en pasos DATA_ANALYSIS/TRADEOFF_DECISION con opción
 *   elegida (mínimo 3), el mismo índice de opción se repite ≥70%.
 */
export function deriveBiasFlags(
  decisions: SimulatorDecisionInput[],
  steps: SimulatorStepForScoring[],
): SimulatorBiasFlags {
  const too_fast = decisions.some((d) => Math.round(d.timeSpentMs / 1000) < 3);

  const applicable = decisions.filter(
    (d) =>
      (d.stepType === 'DATA_ANALYSIS' || d.stepType === 'TRADEOFF_DECISION') &&
      d.selectedOptionId,
  );
  let linear_pattern_detected = false;
  if (applicable.length >= 3) {
    const stepById = new Map(steps.map((s) => [s.id, s]));
    const optionIndices = applicable
      .map((d) => {
        const step = stepById.get(d.stepId);
        if (!step?.options) return -1;
        return step.options.findIndex((o) => o.id === d.selectedOptionId);
      })
      .filter((idx) => idx !== -1);
    if (optionIndices.length >= 3) {
      const indexCounts = new Map<number, number>();
      let maxCount = 0;
      for (const idx of optionIndices) {
        const count = (indexCounts.get(idx) || 0) + 1;
        indexCounts.set(idx, count);
        if (count > maxCount) maxCount = count;
      }
      linear_pattern_detected = maxCount / optionIndices.length >= 0.7;
    }
  }
  return { too_fast, linear_pattern_detected };
}

export interface SimulatorAffinityInput {
  careerSlug: string;
  careerName: string;
  /** Nombre del área STEAM de la carrera (define el eje principal). */
  steamAreaName: string;
  steps: SimulatorStepForScoring[];
  decisions: SimulatorDecisionInput[];
  biasFlags: SimulatorBiasFlags;
}

export interface SimulatorAffinityOutput {
  result: SimulatorAffinityResult;
  feedback: SimulatorFeedbackResponse;
}

/**
 * A3a: acumula el steamTraitWeight de cada opción elegida (o +10 al eje
 * de steamArea si no trae pesos), normaliza relativo al máximo, y aplica:
 *
 *   affinity = clamp_10_100( round( primary * (0.7 + 0.3*timeFactor)
 *                                   - biasDeduction - speedDeduction ) )
 */
export function computeSimulatorAffinity(
  input: SimulatorAffinityInput,
): SimulatorAffinityOutput {
  const { steps, decisions, biasFlags } = input;

  const steamAccum: Record<SteamAxis, number> = {
    ciencia: 0,
    tecnologia: 0,
    ingenieria: 0,
    artes: 0,
    matematicas: 0,
  };
  let scoredDecisions = 0;

  const stepById = new Map(steps.map((s) => [s.id, s]));
  for (const decision of decisions) {
    if (!decision.selectedOptionId) continue;
    const step = stepById.get(decision.stepId);
    if (!step?.options) continue;
    const option = step.options.find((o) => o.id === decision.selectedOptionId);
    if (!option) continue;

    if (option.steamTraitWeight) {
      for (const [axisKey, weight] of Object.entries(option.steamTraitWeight)) {
        const axis = normalizeAxisKey(axisKey);
        if (axis) steamAccum[axis] += weight;
      }
      scoredDecisions++;
    } else if (option.steamArea && AXIS_MAP[option.steamArea]) {
      steamAccum[AXIS_MAP[option.steamArea]] += 10;
      scoredDecisions++;
    }
  }

  // Normalizar a 0-100 relativo al eje con mayor acumulación
  const maxVal = Math.max(...Object.values(steamAccum), 1);
  const steamScores: Record<SteamAxis, number> = { ...steamAccum };
  for (const axis of AXES) {
    steamScores[axis] = Math.round((steamAccum[axis] / maxVal) * 100);
  }

  const primaryAxis = axisFromAreaName(input.steamAreaName);
  const primaryScore =
    scoredDecisions > 0
      ? (steamScores[primaryAxis] ?? SIM_BASE_SIN_DATOS)
      : SIM_BASE_SIN_DATOS;

  const avgTimeSec =
    decisions.length > 0
      ? decisions.reduce((sum, d) => sum + d.timeSpentMs, 0) /
        decisions.length /
        1000
      : 0;

  const timeFactor = Math.min(1, avgTimeSec / SIM_TIME_CAP_SEG);
  const biasDeduction = biasFlags.linear_pattern_detected ? SIM_BIAS_LINEAL : 0;
  const speedDeduction = biasFlags.too_fast ? SIM_BIAS_RAPIDO : 0;
  const affinityScore = Math.max(
    10,
    Math.min(
      100,
      Math.round(
        primaryScore * (0.7 + 0.3 * timeFactor) -
          biasDeduction -
          speedDeduction,
      ),
    ),
  );

  const confidenceLevel: 'high' | 'medium' | 'low' =
    biasFlags.too_fast && biasFlags.linear_pattern_detected
      ? 'low'
      : biasFlags.too_fast || biasFlags.linear_pattern_detected
        ? 'medium'
        : 'high';

  return {
    result: {
      careerSlug: input.careerSlug,
      axis: primaryAxis,
      affinity: affinityScore,
      biasFlags: { ...biasFlags },
    },
    feedback: buildSimulatorFeedback(
      input.careerName,
      input.steamAreaName,
      steamScores,
      affinityScore,
      confidenceLevel,
      avgTimeSec,
    ),
  };
}

/** Plantillas deterministas del feedback del simulador (réplica del frontend). */
function buildSimulatorFeedback(
  careerName: string,
  steamAreaName: string,
  steamScores: Record<SteamAxis, number>,
  affinityScore: number,
  confidenceLevel: 'high' | 'medium' | 'low',
  avgTimeSec: number,
): SimulatorFeedbackResponse {
  const reasoningStyle =
    avgTimeSec > 15
      ? 'Reflexivo y analítico. Tomaste tiempo para evaluar cada escenario con cuidado antes de decidir.'
      : avgTimeSec > 5
        ? 'Equilibrado e intuitivo. Combinaste análisis con instinto al enfrentar cada situación.'
        : 'Rápido y directo. Tus decisiones fueron ágiles; asegúrate de haber leído cada escenario con calma.';

  const STRENGTH_LABELS: Record<SteamAxis, string> = {
    ciencia: 'Pensamiento científico',
    tecnologia: 'Aptitud tecnológica',
    ingenieria: 'Resolución de problemas',
    artes: 'Creatividad aplicada',
    matematicas: 'Razonamiento lógico-matemático',
  };
  const AREA_LABELS: Record<SteamAxis, string> = {
    ciencia: 'CIENCIA',
    tecnologia: 'TECNOLOGÍA',
    ingenieria: 'INGENIERÍA',
    artes: 'ARTES',
    matematicas: 'MATEMÁTICAS',
  };

  const sortedAxes = (
    Object.entries(steamScores) as [SteamAxis, number][]
  ).sort(([, a], [, b]) => b - a);
  const strengthsDetected = sortedAxes
    .slice(0, 3)
    .filter(([, s]) => s > 0)
    .map(([axis]) => STRENGTH_LABELS[axis] || axis);
  if (strengthsDetected.length === 0) {
    strengthsDetected.push(
      'Participación en el simulador',
      'Exploración vocacional',
      'Toma de decisiones',
    );
  }

  const steamAffinityAnalysis =
    sortedAxes
      .slice(0, 3)
      .filter(([, s]) => s > 0)
      .map(
        ([axis, s]) =>
          `${AREA_LABELS[axis] || axis}: ${s >= 70 ? 'Fuerte' : s >= 40 ? 'Moderado' : 'En desarrollo'}`,
      )
      .join(', ') || `${steamAreaName}: Explorado`;

  const honestRealityCheck =
    affinityScore >= 75
      ? `Tu comportamiento mostró una afinidad ${affinityScore >= 85 ? 'muy alta' : 'alta'} con ${careerName}. Las decisiones que tomaste reflejan un perfil compatible con los retos reales de esta carrera.`
      : affinityScore >= 50
        ? `Tienes bases sólidas para esta área, pero algunos escenarios revelaron zonas de incertidumbre. ${careerName} requiere habilidades que podrías desarrollar con práctica constante.`
        : `Tu perfil de decisiones sugiere que esta área puede representar un reto significativo. Explora también otras opciones antes de comprometerte con ${careerName}.`;

  return {
    reasoning_style: reasoningStyle,
    steam_affinity_analysis: steamAffinityAnalysis,
    strengths_detected: strengthsDetected,
    honest_reality_check: honestRealityCheck,
    affinity_score: affinityScore,
    confidence_level: confidenceLevel,
    suggested_next_simulators: [],
  };
}

// ===========================================================================
//  A3b — Agregación de simuladores al vector del perfil
// ===========================================================================

/**
 * Promedia las afinidades de los simuladores por eje. Ejes sin simulador
 * se OMITEN (RG-9).
 */
export function computeSimulatorVector(
  results: SimulatorAffinityResult[],
): Partial<SteamVector> | null {
  if (!results?.length) return null;
  const acc: Partial<Record<SteamAxis, number[]>> = {};
  for (const r of results) {
    const axis = normalizeAxisKey(r.axis);
    if (!axis) continue;
    (acc[axis] ??= []).push(clamp(r.affinity));
  }
  const vector: Partial<SteamVector> = {};
  for (const axis of AXES) {
    const arr = acc[axis];
    if (arr && arr.length) {
      vector[axis] = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    }
  }
  return Object.keys(vector).length ? vector : null;
}

// ===========================================================================
//  A4 — Fusión ponderada (renormalizando pesos por eje)
// ===========================================================================

/**
 * Mezcla por eje: promedio ponderado de las fuentes con señal, dividiendo
 * entre la suma de los pesos PRESENTES. El teórico siempre aporta; un eje
 * sin calibración/simulador no se diluye (RG-9).
 */
export function blendVectors(
  base: SteamVector,
  calib: Partial<SteamVector> | null,
  sim: Partial<SteamVector> | null,
): SteamVector {
  const out = emptyVector();
  for (const axis of AXES) {
    const parts: Array<{ w: number; v: number }> = [
      { w: SOURCE_WEIGHTS.theoretical, v: base[axis] },
    ];
    if (calib && calib[axis] !== undefined) {
      parts.push({ w: SOURCE_WEIGHTS.calibration, v: calib[axis] });
    }
    if (sim && sim[axis] !== undefined) {
      parts.push({ w: SOURCE_WEIGHTS.simulator, v: sim[axis] });
    }
    const totalW = parts.reduce((s, p) => s + p.w, 0);
    out[axis] = Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / totalW);
  }
  return out;
}

/** Ejes ordenados de mayor a menor puntaje (empates conservan el orden STEAM). */
export function computeDominantAxes(scores: SteamVector): SteamAxis[] {
  return [...AXES].sort((a, b) => scores[b] - scores[a]);
}

// ===========================================================================
//  A5 — Medidor de calibración y confianza
// ===========================================================================

export function computeCalibrationState(
  modulesDone: number,
  simsDone: number,
): CalibrationState {
  const level = clamp(
    CALIBRATION_GAINS.theoreticalBase +
      modulesDone * CALIBRATION_GAINS.perCalibrationModule +
      simsDone * CALIBRATION_GAINS.perSimulator,
  );

  let confidence: ConfidenceLevel;
  let explanation: string;
  if (level >= 90) {
    confidence = 'altamente_calibrado';
    explanation =
      'Tu perfil tiene una base sólida de evidencia. Las recomendaciones son altamente confiables.';
  } else if (level >= 75) {
    confidence = 'calibrado';
    explanation =
      'Buen nivel de calibración. Completa algún simulador más para afinar al máximo tu perfil.';
  } else if (level >= 60) {
    confidence = 'en_calibracion';
    explanation =
      'Tu perfil ya tiene forma, pero aún puede refinarse con más tests de calibración y simuladores.';
  } else {
    confidence = 'inicial';
    explanation =
      'Este es tu perfil base. Calíbralo con las experiencias de gaming, hobbies y simuladores para mayor precisión.';
  }
  return {
    level,
    confidence,
    calibrationModulesCompleted: modulesDone,
    simulatorsCompleted: simsDone,
    explanation,
  };
}

// ===========================================================================
//  Narrativa, fortalezas y estilo (plantillas deterministas por eje)
// ===========================================================================

export interface AxisMetaData {
  label: string;
  /** Forma adjetiva para el nombre del perfil (ej. "Tecnológico"). */
  adjective: string;
  icon: string;
  archetype: string;
  strengthTitle: string;
  strengthDesc: string;
  workStyle: string[];
}

/**
 * Metadatos por eje STEAM. Copia literal de AXIS_META del frontend
 * (`vocational-profile.service.ts`). Sirve de semilla para la tabla
 * axis_meta administrable desde el panel admin.
 */
export const DEFAULT_AXIS_META: Record<SteamAxis, AxisMetaData> = {
  ciencia: {
    label: 'Ciencia',
    adjective: 'Científico',
    icon: 'flask-conical',
    archetype: 'Investigador',
    strengthTitle: 'Pensamiento científico',
    strengthDesc:
      'Formulas hipótesis y buscas evidencia antes de concluir. Te mueve entender el porqué de las cosas.',
    workStyle: [
      'Curiosidad metódica',
      'Razonamiento basado en evidencia',
      'Atención al detalle',
    ],
  },
  tecnologia: {
    label: 'Tecnología',
    adjective: 'Tecnológico',
    icon: 'cpu',
    archetype: 'Creador Digital',
    strengthTitle: 'Mentalidad tecnológica',
    strengthDesc:
      'Aprendes herramientas nuevas con facilidad y disfrutas automatizar y construir soluciones digitales.',
    workStyle: [
      'Aprendizaje autodidacta',
      'Lógica computacional',
      'Iteración rápida',
    ],
  },
  ingenieria: {
    label: 'Ingeniería',
    adjective: 'Ingenieril',
    icon: 'wrench',
    archetype: 'Constructor',
    strengthTitle: 'Resolución práctica',
    strengthDesc:
      'Te orientas a soluciones tangibles: diseñas, pruebas y optimizas sistemas que funcionan en el mundo real.',
    workStyle: [
      'Orientación a resultados',
      'Optimización de recursos',
      'Pensamiento sistémico',
    ],
  },
  artes: {
    label: 'Artes',
    adjective: 'Creativo',
    icon: 'palette',
    archetype: 'Visionario Creativo',
    strengthTitle: 'Sensibilidad creativa',
    strengthDesc:
      'Comunicas ideas con impacto visual y emocional. Equilibras estética, propósito y experiencia humana.',
    workStyle: [
      'Pensamiento divergente',
      'Empatía con el usuario',
      'Comunicación visual',
    ],
  },
  matematicas: {
    label: 'Matemáticas',
    adjective: 'Matemático',
    icon: 'sigma',
    archetype: 'Analista',
    strengthTitle: 'Razonamiento abstracto',
    strengthDesc:
      'Modelas problemas complejos con patrones y números. Te sientes cómodo con la abstracción y la lógica formal.',
    workStyle: [
      'Pensamiento abstracto',
      'Análisis cuantitativo',
      'Rigor lógico',
    ],
  },
};

/** Diferencia máxima entre eje1 y eje2 para considerar el perfil híbrido. */
export const UMBRAL_HIBRIDO = 15;

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export interface ProfileNarrative {
  profileName: string;
  profileArchetype: string;
  profileSummary: string;
}

export function buildNarrative(
  dominant: SteamAxis[],
  scores: SteamVector,
  cal: CalibrationState,
  meta: Record<SteamAxis, AxisMetaData> = DEFAULT_AXIS_META,
): ProfileNarrative {
  const a1 = dominant[0];
  const a2 = dominant[1];
  const meta1 = meta[a1];
  const meta2 = meta[a2];

  // Si el segundo eje está cerca del primero (≤15 pts), es un perfil híbrido.
  const hybrid = scores[a1] - scores[a2] <= UMBRAL_HIBRIDO;
  const profileName = hybrid
    ? `Perfil ${meta1.adjective}–${meta2.adjective}`
    : `Perfil ${meta1.adjective}`;
  const profileArchetype = hybrid
    ? `${meta1.archetype} ${meta2.archetype}`
    : meta1.archetype;

  const profileSummary = hybrid
    ? `Tu perfil combina fuertemente ${meta1.label} y ${meta2.label}. Eres alguien que ${lower(meta1.strengthDesc)} y, a la vez, ${lower(meta2.strengthDesc)} Esta combinación te abre puertas en campos donde se cruzan ambas áreas. ${cal.explanation}`
    : `Tu perfil está claramente orientado hacia ${meta1.label}. ${meta1.strengthDesc} Tu segunda área de afinidad es ${meta2.label}, que complementa tu perfil principal. ${cal.explanation}`;

  return { profileName, profileArchetype, profileSummary };
}

export function buildStrengths(
  dominant: SteamAxis[],
  meta: Record<SteamAxis, AxisMetaData> = DEFAULT_AXIS_META,
): ProfileStrength[] {
  return dominant.slice(0, 3).map((axis) => {
    const m = meta[axis];
    return {
      title: m.strengthTitle,
      description: m.strengthDesc,
      axis,
      icon: m.icon,
    };
  });
}

export function buildWorkStyle(
  dominant: SteamAxis[],
  meta: Record<SteamAxis, AxisMetaData> = DEFAULT_AXIS_META,
): string[] {
  const traits = new Set<string>();
  for (const axis of dominant.slice(0, 2)) {
    for (const t of meta[axis].workStyle) traits.add(t);
  }
  return [...traits];
}

// ===========================================================================
//  A6 — Vocaciones predominantes (Top 4) y A7 — Carreras (Top 5)
// ===========================================================================

export const AFINIDAD_FACTOR = 0.85;
export const AFINIDAD_OFFSET = 12;

/** Entrada de catálogo de vocaciones (sin afinidad: se calcula en runtime). */
export type VocationCatalogEntry = Omit<
  VocationRecommendation,
  'affinity' | 'axis'
>;
/** Entrada de catálogo de carreras (sin afinidad ni rationale). */
export type CareerCatalogEntry = Omit<
  CareerRecommendation,
  'affinity' | 'rationale' | 'axis'
>;

/** Afinidad de una recomendación: clamp(round(score*0.85 + 12)). */
export function affinityFor(axis: SteamAxis, scores: SteamVector): number {
  return clamp(Math.round(scores[axis] * AFINIDAD_FACTOR + AFINIDAD_OFFSET));
}

/**
 * A6: recorre el catálogo de los 3 ejes dominantes, asigna afinidad y
 * devuelve las 4 vocaciones más afines.
 */
export function recommendVocations(
  dominant: SteamAxis[],
  scores: SteamVector,
  catalog: Record<SteamAxis, VocationCatalogEntry[]>,
): VocationRecommendation[] {
  const out: VocationRecommendation[] = [];
  for (const axis of dominant.slice(0, 3)) {
    for (const v of catalog[axis] ?? []) {
      out.push({ ...v, axis, affinity: affinityFor(axis, scores) });
    }
  }
  return out.sort((a, b) => b.affinity - a.affinity).slice(0, 4);
}

/**
 * A7: idéntico a A6 pero genera el rationale a partir del eje y devuelve
 * las 5 carreras más afines.
 */
export function recommendCareers(
  dominant: SteamAxis[],
  scores: SteamVector,
  catalog: Record<SteamAxis, CareerCatalogEntry[]>,
  meta: Record<SteamAxis, AxisMetaData> = DEFAULT_AXIS_META,
): CareerRecommendation[] {
  const out: CareerRecommendation[] = [];
  for (const axis of dominant.slice(0, 3)) {
    const m = meta[axis];
    for (const c of catalog[axis] ?? []) {
      out.push({
        ...c,
        axis,
        affinity: affinityFor(axis, scores),
        rationale: `Encaja con tu fuerte afinidad en ${m.label}: ${lower(m.strengthDesc)}`,
      });
    }
  }
  return out.sort((a, b) => b.affinity - a.affinity).slice(0, 5);
}

export function buildNextSteps(
  modulesDone: number,
  simsDone: number,
): NextStep[] {
  const steps: NextStep[] = [];
  if (modulesDone < 4) {
    steps.push({
      type: 'calibration',
      title: 'Completa tus tests de calibración',
      description: `Te faltan ${4 - modulesDone} módulos. Nos ayudan a distinguir lo que realmente te interesa de lo que solo suena bien.`,
      actionLabel: 'Calibrar perfil',
      route: '/evaluations',
      calibrationGain: CALIBRATION_GAINS.perCalibrationModule,
    });
  }
  steps.push({
    type: 'simulator',
    title: 'Vive un simulador de carrera',
    description:
      'Date un "baño de realidad": experimenta decisiones reales de una carrera y comprueba si encaja contigo.',
    actionLabel: 'Explorar simuladores',
    route: '/career-simulator',
    calibrationGain: CALIBRATION_GAINS.perSimulator,
  });
  return steps;
}
