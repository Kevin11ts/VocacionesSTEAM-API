import {
  SteamAxis,
  SteamVector,
  CalibrationState,
  CareerRecommendation,
  ConfidenceLevel,
  NextStep,
  ProfileStrength,
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
export type VocationCatalogEntry = Omit<VocationRecommendation, 'affinity' | 'axis'>;
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
