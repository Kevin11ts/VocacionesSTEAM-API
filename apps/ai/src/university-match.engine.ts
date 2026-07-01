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
 * eso se calcula aquí con datos de BD. La IA solo ajusta el baseScore
 * (±10 máx) y redacta la explicación.
 */

/** Radio máximo de búsqueda de candidatas (km). Los filtros acotan después. */
export const MAX_DISTANCE_KM = 100;

/** Ajuste máximo que la IA puede aplicar sobre el baseScore. */
export const MAX_AI_ADJUSTMENT = 10;

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

/**
 * Match DURO: ¿la universidad ofrece alguna de las carreras recomendadas?
 * Compara nombres normalizados (igualdad o contención en cualquier
 * dirección). Devuelve la primera carrera de A7 (mayor afinidad) que la
 * universidad ofrece, o null si no ofrece ninguna → se EXCLUYE.
 */
export function findOfferedCareer(
  university: Pick<University, 'steamPrograms'>,
  recommendedCareers: Array<{ careerName: string }>,
): string | null {
  const programs = (university.steamPrograms || [])
    .map((p) => normalizeText(p?.name))
    .filter(Boolean);
  if (!programs.length) return null;

  for (const career of recommendedCareers) {
    const wanted = normalizeText(career.careerName);
    if (!wanted) continue;
    const offered = programs.some(
      (p) => p === wanted || p.includes(wanted) || wanted.includes(p),
    );
    if (offered) return career.careerName;
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
 *   50 (ofrece la carrera; si no, ya fue excluida)
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
}): number {
  const maxKm = params.maxDistanceKm ?? MAX_DISTANCE_KM;
  const proximity = (1 - params.distanceKm / maxKm) * 25;
  const cost = costBonus(params.costTier, params.costPreference);
  const quality = ((params.rating ?? 0) / 5) * 10;
  const score = 50 + proximity + cost + quality;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface RawAiMatch {
  universityId?: string;
  matchScore?: number;
  explanation?: string;
  scoreAdjustmentReason?: string;
}

export interface ValidatedAiAdjustment {
  matchScore: number;
  explanation: string;
  scoreAdjustmentReason?: string;
}

/**
 * Valida la salida de la IA contra la lista candidata:
 * - Universidades fuera de la lista se DESCARTAN (anti-alucinación).
 * - El matchScore se acota a baseScore ± 10 y a 0-100.
 */
export function validateAiMatches(
  raw: RawAiMatch[],
  candidates: UniversityCandidate[],
): Record<string, ValidatedAiAdjustment> {
  const byId = new Map(candidates.map((c) => [c.universityId, c]));
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
    validated[candidate.universityId] = {
      matchScore: Math.max(0, Math.min(100, clamped)),
      explanation: match.explanation || '',
      scoreAdjustmentReason: match.scoreAdjustmentReason,
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
    .filter(
      (m) => m.distanceKm <= filters.maxDistanceKm && allowed(m.costTier),
    )
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const tierDiff =
        TIER_ACCESSIBILITY_ORDER[a.costTier] -
        TIER_ACCESSIBILITY_ORDER[b.costTier];
      if (tierDiff !== 0) return tierDiff;
      return a.distanceKm - b.distanceKm;
    });
}
