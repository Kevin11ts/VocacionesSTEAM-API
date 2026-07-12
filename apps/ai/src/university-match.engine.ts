import {
  CostPreference,
  CostTier,
  University,
  UniversityCandidate,
  UniversityMatch,
} from '@app/common';

/**
 * ============================================================================
 *  A8 — CAPA DETERMINISTA del matching de universidades (sin IA)
 * ============================================================================
 *
 * La IA nunca decide si un programa existe, ni la distancia, ni el costo:
 * eso se calcula aquí con datos de BD. La IA refina el ranking (±15 máx),
 * identifica el programa real más afín a la carrera recomendada y redacta
 * la explicación personalizada.
 */

/** Radio máximo de búsqueda de candidatas (km). Los filtros acotan después. */
export const MAX_DISTANCE_KM = 100;

/**
 * Ajuste máximo que la IA puede aplicar sobre el baseScore. Subió de 10 a 15
 * cuando la IA pasó de solo "explicar" a hacer juicio semántico real (decidir
 * qué programa de la universidad es el más afín a la carrera recomendada).
 */
export const MAX_AI_ADJUSTMENT = 15;

const TIER_ACCESSIBILITY_ORDER: Record<CostTier, number> = {
  public: 0,
  affordable: 1,
  'private-premium': 2,
};

function normalizeText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Nivel del match determinista carrera↔programa (ver findCareerMatch). */
export type CareerMatchType = 'direct' | 'area';

export interface CareerMatch {
  /** Carrera recomendada de A7 a la que corresponde el match. */
  careerName: string;
  matchType: CareerMatchType;
  /** Programa REAL de la universidad que produjo el match (nombre tal cual está en BD). */
  matchedProgram: string;
}

/**
 * Matching determinista en 2 niveles:
 *
 *   1. DIRECTO: el nombre de algún programa coincide con una carrera
 *      recomendada (igualdad o contención normalizada, en cualquier
 *      dirección). Es el match más fuerte → base 50.
 *
 *   2. POR ÁREA: ningún nombre coincide literalmente, pero la universidad
 *      ofrece programas del mismo eje STEAM (`steamPrograms[].area`) que
 *      alguna carrera recomendada (`axis`) → base 35. Cubre equivalencias
 *      que el substring no ve ("Ing. en Sistemas Computacionales" para un
 *      perfil de "Ingeniería en Software"); la IA refina después cuál
 *      programa del área es el más afín semánticamente.
 *
 * Devuelve null solo si la universidad no tiene programas o ninguno cae en
 * los ejes recomendados → se EXCLUYE.
 */
export function findCareerMatch(
  university: Pick<University, 'steamPrograms'>,
  recommendedCareers: Array<{ careerName: string; axis: string }>,
): CareerMatch | null {
  const programs = (university.steamPrograms || [])
    .filter((p) => p?.name)
    .map((p) => ({
      name: p.name,
      normName: normalizeText(p.name),
      area: normalizeText(p.area || ''),
    }));
  if (!programs.length) return null;

  // Nivel 1 — directo (se respeta el orden de A7: mayor afinidad primero)
  for (const career of recommendedCareers) {
    const wanted = normalizeText(career.careerName);
    if (!wanted) continue;
    const program = programs.find(
      (p) =>
        p.normName === wanted ||
        p.normName.includes(wanted) ||
        wanted.includes(p.normName),
    );
    if (program) {
      return {
        careerName: career.careerName,
        matchType: 'direct',
        matchedProgram: program.name,
      };
    }
  }

  // Nivel 2 — por eje STEAM
  for (const career of recommendedCareers) {
    const axis = normalizeText(career.axis || '');
    if (!axis) continue;
    const program = programs.find((p) => p.area === axis);
    if (program) {
      return {
        careerName: career.careerName,
        matchType: 'area',
        matchedProgram: program.name,
      };
    }
  }
  return null;
}

/** Distancia en línea recta (haversine) en km, redondeada a 1 decimal. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371; // radio terrestre medio en km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  const distance = 2 * R * Math.asin(Math.sqrt(h));
  return Math.round(distance * 10) / 10;
}

/**
 * Bono por ajuste de costo:
 *   +15 si el tier coincide con la preferencia del usuario
 *   +7  si es una opción accesible (public/affordable) sin coincidencia exacta
 *   +0  si es premium y no se pidió
 */
export function costBonus(
  costTier: CostTier,
  costPreference: CostPreference,
): number {
  if (costPreference !== 'any' && costTier === costPreference) return 15;
  if (costTier === 'public' || costTier === 'affordable') return 7;
  return 0;
}

/**
 * baseScore (0-100) de la sección 3 del documento de A8:
 *   50 si el match es directo / 35 si es por eje STEAM (área)
 *   + (1 - distanceKm/maxDistanceKm) * 25   ← cercanía, hasta +25
 *   + bono de costo                          ← hasta +15
 *   + (rating/5) * 10                        ← calidad, hasta +10
 */
export function computeBaseScore(params: {
  distanceKm: number;
  costTier: CostTier;
  costPreference: CostPreference;
  rating?: number | null;
  maxDistanceKm?: number;
  matchType?: CareerMatchType;
}): number {
  const maxKm = params.maxDistanceKm ?? MAX_DISTANCE_KM;
  const base = params.matchType === 'area' ? 35 : 50;
  const proximity = (1 - params.distanceKm / maxKm) * 25;
  const cost = costBonus(params.costTier, params.costPreference);
  const quality = ((params.rating ?? 0) / 5) * 10;
  const score = base + proximity + cost + quality;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface RawAiMatch {
  universityId?: string;
  matchScore?: number;
  explanation?: string;
  scoreAdjustmentReason?: string;
  /** Programa REAL de la universidad que la IA identificó como el más afín. */
  matchedProgram?: string;
  /** Carrera recomendada de A7 a la que ese programa corresponde. */
  matchedCareer?: string;
}

export interface ValidatedAiAdjustment {
  matchScore: number;
  explanation: string;
  scoreAdjustmentReason?: string;
  matchedProgram?: string;
  matchedCareer?: string;
}

/**
 * Valida la salida de la IA contra la lista candidata:
 * - Universidades fuera de la lista se DESCARTAN (anti-alucinación).
 * - El matchScore se acota a baseScore ± MAX_AI_ADJUSTMENT y a 0-100.
 * - matchedProgram solo se acepta si existe LITERALMENTE entre los
 *   steamPrograms de esa candidata; matchedCareer solo si es una de las
 *   carreras recomendadas de A7. Si no pasan, se ignoran y el ensamble
 *   usa los valores deterministas.
 */
export function validateAiMatches(
  raw: RawAiMatch[],
  candidates: UniversityCandidate[],
  recommendedCareers: Array<{ careerName: string }> = [],
): Record<string, ValidatedAiAdjustment> {
  const byId = new Map(candidates.map((c) => [c.universityId, c]));
  const validCareers = new Set(
    recommendedCareers.map((c) => normalizeText(c.careerName)).filter(Boolean),
  );
  const validated: Record<string, ValidatedAiAdjustment> = {};
  for (const match of raw || []) {
    if (!match?.universityId) continue;
    const candidate = byId.get(match.universityId);
    if (!candidate) continue; // no estaba en la lista: descartada
    const proposed =
      typeof match.matchScore === 'number'
        ? match.matchScore
        : candidate.baseScore;
    const clamped = Math.max(
      candidate.baseScore - MAX_AI_ADJUSTMENT,
      Math.min(candidate.baseScore + MAX_AI_ADJUSTMENT, Math.round(proposed)),
    );

    const programNames = new Set(
      (candidate.steamPrograms || [])
        .map((p) => normalizeText(p?.name))
        .filter(Boolean),
    );
    const matchedProgram =
      typeof match.matchedProgram === 'string' &&
      programNames.has(normalizeText(match.matchedProgram))
        ? match.matchedProgram
        : undefined;
    const matchedCareer =
      typeof match.matchedCareer === 'string' &&
      validCareers.has(normalizeText(match.matchedCareer))
        ? match.matchedCareer
        : undefined;

    validated[candidate.universityId] = {
      matchScore: Math.max(0, Math.min(100, clamped)),
      explanation: match.explanation || '',
      scoreAdjustmentReason: match.scoreAdjustmentReason,
      matchedProgram,
      matchedCareer,
    };
  }
  return validated;
}

/**
 * Aplica los filtros (km y costo) SOBRE el resultado cacheado — sin IA —
 * y ordena: matchScore desc; en empate gana la más accesible
 * económicamente y luego la más cercana (regla anti-sesgo 9).
 */
export function applyFiltersAndSort(
  matches: UniversityMatch[],
  filters: { maxDistanceKm: number; costPreference: CostPreference },
): UniversityMatch[] {
  const allowed = (tier: CostTier) => {
    if (filters.costPreference === 'public') return tier === 'public';
    if (filters.costPreference === 'affordable') {
      return tier === 'public' || tier === 'affordable';
    }
    return true;
  };
  return matches
    .filter((m) => m.distanceKm <= filters.maxDistanceKm && allowed(m.costTier))
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const tierDiff =
        TIER_ACCESSIBILITY_ORDER[a.costTier] -
        TIER_ACCESSIBILITY_ORDER[b.costTier];
      if (tierDiff !== 0) return tierDiff;
      return a.distanceKm - b.distanceKm;
    });
}
