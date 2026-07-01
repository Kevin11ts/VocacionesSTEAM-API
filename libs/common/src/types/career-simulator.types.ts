/**
 * Tipos del simulador de carrera que la API comparte con la PWA
 * (subconjunto de `career-simulator.models.ts` del frontend necesario
 * para el algoritmo A3a).
 */

/** Decisión del usuario en un paso del simulador. */
export interface SimulatorDecisionInput {
  /** Identificador del paso al que corresponde esta decisión. */
  stepId: string;
  /** Tipo de paso (CONTEXT, DATA_ANALYSIS, TRADEOFF_DECISION, ...). */
  stepType?: string;
  /** Identificador de la opción seleccionada, si el paso era de selección. */
  selectedOptionId?: string;
  /** Tiempo en milisegundos que le tomó al usuario completar el paso. */
  timeSpentMs: number;
}

/** Banderas de sesgo detectadas durante la sesión del simulador. */
export interface SimulatorBiasFlags {
  too_fast: boolean;
  linear_pattern_detected: boolean;
}

/**
 * Feedback determinista del simulador (misma forma que el
 * SimulatorFeedbackResponse que consume la pantalla de resultados).
 */
export interface SimulatorFeedbackResponse {
  reasoning_style: string;
  steam_affinity_analysis: string;
  strengths_detected: string[];
  honest_reality_check: string;
  affinity_score: number;
  confidence_level: 'high' | 'medium' | 'low';
  suggested_next_simulators: string[];
}
