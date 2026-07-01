/**
 * ============================================================================
 *  CONTRATO CANÓNICO DEL PERFIL VOCACIONAL CALIBRADO
 * ============================================================================
 *
 * Réplica exacta del contrato del frontend
 * (`src/app/core/models/vocational-profile.models.ts` en la PWA), que es la
 * fuente de verdad de la forma de los datos (RG-3 del mandato).
 *
 * El perfil final es un vector STEAM (5 ejes) construido con 3 fuentes:
 *   1. Test teórico (20 preguntas)  → CIMIENTO         (peso 55%)
 *   2. Tests de calibración (swipe) → CORRECCIÓN SESGO (peso 30%)
 *   3. Simuladores de carrera       → BAÑO DE REALIDAD (peso 15%)
 */

// ---------------------------------------------------------------------------
// Ejes STEAM
// ---------------------------------------------------------------------------

/** Los 5 ejes del modelo STEAM, claves sin acentos y en minúscula (RG-5). */
export type SteamAxis =
  | 'ciencia'
  | 'tecnologia'
  | 'ingenieria'
  | 'artes'
  | 'matematicas';

/** Lista canónica de los 5 ejes, en orden STEAM. */
export const STEAM_AXES: SteamAxis[] = [
  'ciencia',
  'tecnologia',
  'ingenieria',
  'artes',
  'matematicas',
];

/** Vector de puntuaciones STEAM. Cada valor es entero 0-100 (RG-6). */
export interface SteamVector {
  ciencia: number;
  tecnologia: number;
  ingenieria: number;
  artes: number;
  matematicas: number;
}

/** Las 3 fuentes de señal que alimentan el perfil. */
export type ProfileSource = 'theoretical' | 'calibration' | 'simulator';

/**
 * Versión del contrato/constantes (RG-8). Cambiar los pesos o ganancias
 * exige subir esta versión (RG-4).
 */
export const PROFILE_VERSION = '1.0.0';

/** Pesos globales de cada fuente sobre el perfil final (RG-4: inmutables). */
export const SOURCE_WEIGHTS: Record<ProfileSource, number> = {
  theoretical: 0.55,
  calibration: 0.3,
  simulator: 0.15,
};

/**
 * Aporte de calibración (confianza) por cada test completado, en puntos
 * porcentuales sobre el medidor 0-100 (RG-4: inmutables).
 */
export const CALIBRATION_GAINS = {
  /** Completar el test teórico fija la base de calibración. */
  theoreticalBase: 55,
  /** Cada módulo de calibración (swipe deck) completado. */
  perCalibrationModule: 10,
  /** Cada simulador de carrera completado. */
  perSimulator: 7,
} as const;

// ---------------------------------------------------------------------------
// Contribuciones (trazabilidad de cómo se formó el perfil — RG-7)
// ---------------------------------------------------------------------------

export interface ProfileContribution {
  source: ProfileSource;
  /** Id de la fuente: módulo de calibración o slug del simulador. */
  sourceId?: string;
  /** Etiqueta legible (ej. "Test teórico", "Hábitos de Gaming"). */
  label: string;
  /** Peso efectivo aplicado (0-1). */
  weight: number;
  /** Aporte normalizado al vector STEAM (puede ser parcial). */
  vector: Partial<SteamVector>;
  /** ISO date de cuándo se registró la contribución. */
  takenAt?: string;
}

// ---------------------------------------------------------------------------
// Calibración / confianza
// ---------------------------------------------------------------------------

/** Nivel cualitativo de calibración del perfil. */
export type ConfidenceLevel =
  | 'inicial' // solo test teórico
  | 'en_calibracion' // algo de calibración/simuladores
  | 'calibrado' // buena cobertura
  | 'altamente_calibrado';

export interface CalibrationState {
  /** Medidor 0-100. */
  level: number;
  confidence: ConfidenceLevel;
  /** Cuántos módulos de calibración se completaron. */
  calibrationModulesCompleted: number;
  /** Cuántos simuladores se completaron. */
  simulatorsCompleted: number;
  /** Frase explicativa de qué significa el nivel actual. */
  explanation: string;
}

// ---------------------------------------------------------------------------
// Fortalezas y estilo
// ---------------------------------------------------------------------------

export interface ProfileStrength {
  title: string;
  description: string;
  axis: SteamAxis;
  /** Nombre de ícono lucide para la UI. */
  icon: string;
}

// ---------------------------------------------------------------------------
// Recomendaciones: vocaciones (A6) y carreras (A7)
// ---------------------------------------------------------------------------

export interface VocationRecommendation {
  name: string;
  axis: SteamAxis;
  /** Afinidad 0-100 con el perfil del usuario. */
  affinity: number;
  description: string;
  /** Habilidades clave asociadas. */
  skills: string[];
  icon: string;
}

export interface CareerRecommendation {
  careerName: string;
  axis: SteamAxis;
  /** Afinidad 0-100 con el perfil. */
  affinity: number;
  /** Por qué encaja con el perfil del usuario. */
  rationale: string;
  /** Materias / ejes destacados del plan de estudios. */
  studyPlanHighlights: string[];
  /** Campos laborales típicos. */
  careerFields: string[];
  /** Slug del simulador relacionado para "baño de realidad" (si existe). */
  relatedSimulatorSlug?: string;
  icon: string;
}

// ---------------------------------------------------------------------------
// Próximos pasos (cómo subir la precisión)
// ---------------------------------------------------------------------------

export interface NextStep {
  type: 'calibration' | 'simulator';
  title: string;
  description: string;
  actionLabel: string;
  route: string;
  /** Cuánto subiría el medidor de calibración si lo completa. */
  calibrationGain: number;
}

// ---------------------------------------------------------------------------
// Perfil vocacional final (lo que consume la vista de resultados)
// ---------------------------------------------------------------------------

export interface VocationalProfile {
  /** Vector STEAM final calibrado (0-100 por eje). */
  steamScores: SteamVector;
  /** Ejes ordenados de mayor a menor afinidad. */
  dominantAxes: SteamAxis[];
  /** Nombre del perfil (ej. "Perfil Tecnológico–Científico"). */
  profileName: string;
  /** Arquetipo corto (ej. "Creador Digital"). */
  profileArchetype: string;
  /** Párrafo descriptivo y detallado del perfil. */
  profileSummary: string;

  /** Estado de calibración / confianza. */
  calibration: CalibrationState;
  /** Trazabilidad de las contribuciones que formaron el perfil (RG-7). */
  contributions: ProfileContribution[];

  /** Fortalezas detectadas. */
  strengths: ProfileStrength[];
  /** Rasgos de estilo de trabajo/razonamiento. */
  workStyle: string[];

  /** A6: vocaciones predominantes. */
  recommendedVocations: VocationRecommendation[];
  /** A7: carreras / planes de estudio afines. */
  recommendedCareers: CareerRecommendation[];

  /** Próximos pasos para subir la precisión del perfil. */
  nextSteps: NextStep[];

  /** ISO date de generación. */
  generatedAt: string;

  /** Versión de los pesos/constantes con que se calculó (RG-8). */
  profileVersion: string;
}

// ---------------------------------------------------------------------------
// Request hacia la API
// ---------------------------------------------------------------------------

export interface ProfileComputationRequest {
  /** Respuestas del test teórico: { [questionId]: "A" | "B" | ... }. */
  theoreticalAnswers: Record<string, string>;
  /** Resultados de los módulos de calibración completados. */
  calibrationResults?: CalibrationModuleResult[];
  /** Resultados de los simuladores completados. */
  simulatorResults?: SimulatorAffinityResult[];
  /** Ubicación opcional para recomendación de universidades. */
  locationInput?: string;
}

/** Resultado de un módulo de calibración (swipe deck). */
export interface CalibrationModuleResult {
  moduleId: string;
  /** Por cada carta: liked/disliked + el eje STEAM al que pertenece. */
  answers: Array<{ axis: SteamAxis; liked: boolean }>;
}

/** Afinidad resultante de un simulador de carrera. */
export interface SimulatorAffinityResult {
  careerSlug: string;
  axis: SteamAxis;
  /** Afinidad 0-100 calculada algorítmicamente (A3a). */
  affinity: number;
  /** Banderas de sesgo detectadas durante la simulación. */
  biasFlags?: { too_fast: boolean; linear_pattern_detected: boolean };
}
