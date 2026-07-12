/**
 * Filtros de nombre compartidos para decidir qué registros NO son
 * instituciones de educación superior. Se usan en:
 *  - los tres descubrimientos (Places admin, DENUE, "cerca de ti"),
 *  - la lista "cerca de ti" que ve el alumno (getNearbyUniversities),
 *  - las candidatas del matching A8 (buildCandidates),
 *  - la limpieza retroactiva del admin (cleanupJunkUniversities).
 */

/**
 * Nombres que Google Places / DENUE devuelven bajo criterios de educación
 * pero que en realidad son oficinas de gobierno, sindicatos, clínicas o
 * servicios internos de una institución (no la institución en sí).
 */
export const JUNK_NAME_PATTERNS: RegExp[] = [
  /^ESTACIONAMIENTO\b/i,
  /^SINDICATO\b/i,
  /^PRESIDENCIA MUNICIPAL\b/i,
  /^AYUNTAMIENTO\b/i,
  /^DELEGACION\b/i,
  /^SECRETARIA DE EDUCACI[OÓ]N P[UÚ]BLICA$/i, // exacto: la dependencia en sí, no un nombre que solo la incluye
  /^DESPACHO JUR[IÍ]DICO\b/i,
  /^DIRECCI[OÓ]N (GENERAL )?DE (FOMENTO|DEPORTE)\b/i,
  /^SITIO WEB TEMPORAL\b/i,
  /^ALMAC[EÉ]N\b/i,
  /^BODEGA\b/i,
  /^CAMPO DE (BEISBOL|F[UÚ]TBOL|DEPORTES|TIRO)\b/i,
  /^ABOGADO GENERAL\b/i,
  /^CONSEJO ACAD[EÉ]MICO\b/i,
  /^OFICINA ADMINISTRATIVA\b/i,
  /^FONDO DE\b/i,
  /SIN NOMBRE$/i, // artefacto del propio censo del INEGI, no un nombre real
];

/**
 * Escuelas de nivel básico/medio (preparatorias, secundarias, primarias,
 * kinders, subsistemas de bachillerato) que Places devuelve bajo búsquedas
 * de "universidad" y que NO deben mostrarse al alumno ni entrar a A8.
 * OJO: no incluir "escuela normal" (las normales SÍ son educación superior).
 */
export const NON_UNIVERSITY_NAME_PATTERNS: RegExp[] = [
  /\bPREPARATORIA\b/i,
  /\bPREPA\b/i,
  /\bSECUNDARIA\b/i,
  /\bTELESECUNDARIA\b/i,
  /\bPRIMARIA\b/i,
  /\bPREESCOLAR\b/i,
  /\bKINDER\b/i,
  /\bJARD[IÍ]N DE NI[ÑN]OS\b/i,
  /\bGUARDER[IÍ]A\b/i,
  /\bESTANCIA INFANTIL\b/i,
  /\bBACHILLERATO\b/i,
  /\bTELEBACHILLERATO\b/i,
  /\bBACHILLERES\b/i, // Colegio de Bachilleres y variantes estatales
  /\bCBTIS\b/i,
  /\bCBTA\b/i,
  /\bCETIS\b/i,
  /\bCECYTE\w*\b/i,
  /\bCONALEP\b/i,
  /\bCOBACH\b/i,
];

/** true si el nombre corresponde a basura administrativa (oficinas, sindicatos, etc.). */
export function isJunkName(name: string): boolean {
  const upper = (name || '').toUpperCase().trim();
  if (!upper) return true;
  return JUNK_NAME_PATTERNS.some((re) => re.test(upper));
}

/** true si el nombre corresponde a una escuela de nivel básico/medio (no universidad). */
export function isNonUniversityName(name: string): boolean {
  const upper = (name || '').toUpperCase().trim();
  if (!upper) return true;
  return NON_UNIVERSITY_NAME_PATTERNS.some((re) => re.test(upper));
}

/** Filtro combinado: cualquier nombre que NO debe tratarse como universidad. */
export function isExcludedInstitutionName(name: string): boolean {
  return isJunkName(name) || isNonUniversityName(name);
}

/**
 * Clasificaciones de la IA que NO son educación superior real — los
 * candidatos nuevos con estas etiquetas se descartan y los registros ya
 * guardados con ellas no se muestran al alumno.
 */
export const DISCARDED_INSTITUTION_TYPES = new Set([
  'high_school',
  'government_office',
  'administrative_office',
  'legal_office',
  'clinic_or_service_center',
  'duplicated_record',
  'permanently_closed',
  'other',
]);
