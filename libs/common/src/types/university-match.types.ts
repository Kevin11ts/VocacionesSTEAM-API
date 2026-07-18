/**
 * Contrato del algoritmo A8 — Matching de universidades (IA + datos duros).
 * Arquitectura de 2 capas: la capa determinista calcula match duro,
 * distancia, costo y baseScore; la IA rankea fino (±15) y explica.
 */
import { SteamAxis } from './vocational-profile.types';

export type CostTier = 'public' | 'affordable' | 'private-premium';
export type CostPreference = 'public' | 'affordable' | 'any';

export const MATCH_DISTANCE_OPTIONS = [10, 25, 50, 100] as const;

export interface UniversityMatchFilters {
  /** 10 | 25 | 50 | 100 km. Se aplica sobre el caché, sin llamar a la IA. */
  maxDistanceKm: number;
  costPreference: CostPreference;
}

export interface RecommendedCareerInput {
  careerName: string;
  axis: SteamAxis;
}

export interface UniversityMatchRequest {
  /** Salida de A7. Si se omite, se usa el último perfil guardado. */
  recommendedCareers?: RecommendedCareerInput[];
  userLocation: { lat: number; lng: number };
  filters: UniversityMatchFilters;
}

/** Candidata calculada por la capa determinista (entrada de la IA). */
export interface UniversityCandidate {
  universityId: string;
  name: string;
  offersCareer: string;
  /** 'direct' = el nombre del programa coincide con la carrera; 'area' = mismo eje STEAM. */
  matchType?: 'direct' | 'area';
  /** Programa real de la universidad que produjo el match determinista. */
  matchedProgram?: string;
  distanceKm: number;
  costTier: CostTier;
  tuitionRange?: string;
  rating?: number;
  modality?: string;
  /** Fecha/periodo de examen de admisión, ficha o convocatoria (solo si el sitio lo menciona explícitamente). */
  admissionDates?: string;
  baseScore: number;
  websiteUrl?: string;
  address?: string;
  /** Oferta educativa completa (no solo la carrera que hizo match duro). */
  steamPrograms?: { name: string; area: string; sourceUrl?: string }[];
  /** Coordenadas de la universidad (para el mapa del frontend). */
  location?: { lat: number; lng: number };
}

export interface UniversityMatch {
  universityId: string;
  name: string;
  matchedCareer: string;
  /**
   * Programa REAL de la universidad más afín a matchedCareer (puede diferir
   * del nombre del catálogo: "Ing. en Sistemas Computacionales" para una
   * carrera recomendada "Ingeniería en Software").
   */
  matchedProgram?: string;
  /** true si este match fue analizado individualmente por la IA (mejor coincidencia + sugerencias secundarias); false = ranking determinista. */
  aiAnalyzed?: boolean;
  matchScore: number;
  distanceKm: number;
  costTier: CostTier;
  explanation: string;
  websiteUrl?: string;
  /** Rango de colegiatura legible (dato duro, no lo genera la IA). */
  tuitionRange?: string;
  /** presencial | en línea | híbrida. */
  modality?: string;
  /** Fecha/periodo de examen de admisión, ficha o convocatoria (solo si el sitio lo menciona explícitamente). */
  admissionDates?: string;
  /** Oferta educativa completa (no solo matchedCareer). */
  steamPrograms?: { name: string; area: string; sourceUrl?: string }[];
  googleMapsData?: { rating?: number; address?: string };
  /** Coordenadas de la universidad (para el mapa del frontend). */
  location?: { lat: number; lng: number };
  /** Justificación del ajuste de la IA sobre el baseScore (±15 máx). */
  scoreAdjustmentReason?: string;
}

export interface UniversityMatchResponse {
  matches: UniversityMatch[];
  generatedAt: string;
  /** Cuántas coincidencias recibieron análisis individual de la IA. */
  aiAnalyzedCount?: number;
  /** Total de candidatas reales visibles después de aplicar filtros. */
  candidateCount?: number;
  /**
   * Origen del ranking fino: 'Groq' cuando la IA explicó los matches, o
   * 'deterministic' si se degradó a baseScore puro (IA caída o sin API key).
   * Observabilidad para frontend y soporte.
   */
  aiProvider?: string;
}
