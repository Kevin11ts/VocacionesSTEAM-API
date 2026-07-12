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

/**
 * Nombres de DIVISIÓN ACADÉMICA / centro universitario / facultad genérica
 * que la IA a veces confunde con una carrera al leer páginas de "oferta
 * académica" organizadas por centros temáticos (patrón típico de
 * universidades tipo UDG: "Centro Universitario de Ciencias de la Salud",
 * etc.). El HTML→texto plano de fetchPage() no conserva jerarquía, así que
 * esos encabezados de sección quedan indistinguibles de un ítem de lista de
 * carreras — este filtro es la segunda red, aplicado después de que Groq
 * responde, sobre cada `steamPrograms[].name`.
 *
 * Coincidencia EXACTA (no substring): un programa real puede legítimamente
 * mencionar estas palabras dentro de un nombre más largo y específico
 * (ej. "Licenciatura en Humanidades" si de verdad es una carrera con ese
 * nombre exacto NO debería colapsar con esto porque no es igual a
 * "humanidades" a secas) — por eso se compara el nombre completo
 * normalizado, no si lo contiene.
 */
const GENERIC_PROGRAM_NAMES = new Set([
  'ciencia',
  'tecnologia',
  'ingenieria',
  'artes',
  'matematicas',
  'ciencias de la salud',
  'ciencias biologicas y agropecuarias',
  'ciencias economico administrativas',
  'economico administrativa',
  'economico administrativas',
  'humanidades',
  'ciencias sociales y humanidades',
  'ciencias exactas e ingenierias',
  'arte arquitectura y diseno',
  'tecnica',
]);

/** Prefijos de división/centro/facultad que NUNCA son, por sí solos, el nombre de una carrera. */
const GENERIC_PROGRAM_PREFIXES: RegExp[] = [
  /^centro universitario\b/i,
  /^divisi[oó]n de\b/i,
  /^facultad de$/i, // exacto: "Facultad de" sin nada después
  /^escuela de$/i, // exacto: "Escuela de" sin nada después
];

function normalizeProgramName(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * true si `name` es un nombre de división/centro/facultad genérico, NO una
 * carrera real — se usa para filtrar la respuesta de Groq en steamPrograms
 * antes de guardarla (enrichExistingUniversity, validateNewCandidate,
 * enrichUniversitiesWithAi).
 */
export function isGenericProgramName(name: string): boolean {
  const normalized = normalizeProgramName(name);
  if (!normalized) return true;
  if (GENERIC_PROGRAM_NAMES.has(normalized)) return true;
  return GENERIC_PROGRAM_PREFIXES.some((re) => re.test(normalized));
}
