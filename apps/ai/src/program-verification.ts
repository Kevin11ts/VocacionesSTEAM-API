import {
  isGenericProgramName,
  normalizeProgramName,
} from './institution-filter';

export interface OfficialSitePage {
  url: string;
  text: string;
}

export interface ExtractedSteamProgram {
  name?: unknown;
  area?: unknown;
  sourceUrl?: unknown;
}

export interface VerifiedSteamProgram {
  name: string;
  area: string;
  sourceUrl: string;
}

interface UniversityProgramCatalog {
  steamPrograms?: { name: string; area: string; sourceUrl?: string }[] | null;
  programsVerifiedAt?: Date | string | null;
  programsVerificationSource?: string | null;
  source?: string | null;
}

const VALID_AREAS = new Set([
  'ciencia',
  'tecnologia',
  'ingenieria',
  'artes',
  'matematicas',
]);

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim().replace(/\/$/, '');
  }
}

/** Extrae el nombre de campus/sede/plantel cuando el registro es específico. */
export function extractInstitutionScope(universityName: string): string | null {
  const match = (universityName || '').match(
    /\b(?:campus|plantel|sede)\s+([^,|–—-]+)/i,
  );
  if (!match?.[1]) return null;
  return match[1].replace(/\brector[ií]a\b.*$/i, '').trim() || null;
}

function pageSupportsProgram(
  page: OfficialSitePage,
  programName: string,
  scope: string | null,
): boolean {
  const text = normalizeProgramName(page.text);
  const program = normalizeProgramName(programName);
  if (!text || !program) return false;

  const isWordCharacter = (value: string | undefined) =>
    !!value && /[\p{L}\p{N}]/u.test(value);
  const nextLiteralOccurrence = (from: number): number => {
    let found = text.indexOf(program, from);
    while (found >= 0) {
      const before = text[found - 1];
      const after = text[found + program.length];
      if (!isWordCharacter(before) && !isWordCharacter(after)) return found;
      found = text.indexOf(program, found + program.length);
    }
    return -1;
  };

  let index = nextLiteralOccurrence(0);
  if (index < 0) return false;
  if (!scope) return true;

  const normalizedScope = normalizeProgramName(scope);
  const compactScope = normalizedScope.replace(/\s+/g, '');
  const compactUrl = normalizeProgramName(page.url).replace(/\s+|[-_]/g, '');
  if (compactScope && compactUrl.includes(compactScope)) return true;

  // Para catálogos multi-campus, la sede debe aparecer cerca del nombre de
  // la carrera. Se revisan todas sus apariciones, no solo la primera.
  while (index >= 0) {
    // La mayoría de catálogos escribe "Carrera CAMPUS1 CAMPUS2". Hacia
    // atrás solo se admite una cabecera explícita ("Campus X: Carrera"),
    // para no heredar la sede listada por la carrera anterior.
    const after = text.slice(index, index + program.length + 40);
    // Algunos catálogos pierden sus iconos/separadores al convertirse a
    // texto y dejan una "I" entre tarjetas. No se debe cruzar ese límite:
    // la sede posterior ya corresponde a la siguiente carrera.
    const sameCatalogItem = after.split(/\s(?:i|\||•)\s/)[0];
    const before = text.slice(Math.max(0, index - 100), index);
    const escapedScope = normalizedScope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const explicitHeading = new RegExp(
      `(?:campus|plantel|sede)\\s+${escapedScope}\\s*[:|/-]?\\s*$|${escapedScope}\\s*:\\s*$`,
    );
    if (
      sameCatalogItem.includes(normalizedScope) ||
      explicitHeading.test(before)
    ) {
      return true;
    }
    index = nextLiteralOccurrence(index + program.length);
  }
  return false;
}

/**
 * Red anti-alucinación de la oferta académica: una carrera solo pasa si su
 * nombre aparece literalmente en el texto descargado de una página oficial.
 * Si el registro representa un campus/sede, esa sede también debe aparecer
 * en el contexto inmediato o en la URL de la página.
 */
export function verifyProgramsAgainstOfficialPages(
  rawPrograms: ExtractedSteamProgram[],
  pages: OfficialSitePage[],
  universityName: string,
): VerifiedSteamProgram[] {
  const usablePages = (pages || []).filter((page) => page?.url && page?.text);
  const pageByUrl = new Map(
    usablePages.map((page) => [canonicalUrl(page.url), page]),
  );
  const scope = extractInstitutionScope(universityName);
  const seen = new Set<string>();
  const verified: VerifiedSteamProgram[] = [];

  for (const raw of rawPrograms || []) {
    if (typeof raw?.name !== 'string' || typeof raw?.area !== 'string')
      continue;
    const name = raw.name.replace(/\s+/g, ' ').trim();
    const area = normalizeProgramName(raw.area);
    const normalizedName = normalizeProgramName(name);
    if (
      !name ||
      !VALID_AREAS.has(area) ||
      isGenericProgramName(name) ||
      seen.has(normalizedName)
    ) {
      continue;
    }

    const requestedPage =
      typeof raw.sourceUrl === 'string'
        ? pageByUrl.get(canonicalUrl(raw.sourceUrl))
        : undefined;
    const sourcePage =
      requestedPage && pageSupportsProgram(requestedPage, name, scope)
        ? requestedPage
        : usablePages.find((page) => pageSupportsProgram(page, name, scope));
    if (!sourcePage) continue;

    seen.add(normalizedName);
    verified.push({ name, area, sourceUrl: sourcePage.url });
  }

  return verified;
}

/**
 * Oferta apta para mostrarse y participar en A8. Los catálogos automáticos
 * antiguos, sin verificación, se ocultan hasta volver a contrastarlos. Las
 * altas manuales del administrador se conservan como fuente curada.
 */
export function recommendationPrograms(
  university: UniversityProgramCatalog,
): { name: string; area: string; sourceUrl?: string }[] {
  const catalogIsTrusted =
    !!university.programsVerifiedAt ||
    !!university.programsVerificationSource ||
    university.source === 'manual';
  if (!catalogIsTrusted) return [];

  const seen = new Set<string>();
  return (university.steamPrograms || []).filter((program) => {
    const name = typeof program?.name === 'string' ? program.name.trim() : '';
    const area = normalizeProgramName(program?.area || '');
    const normalizedName = normalizeProgramName(name);
    if (
      !name ||
      !VALID_AREAS.has(area) ||
      isGenericProgramName(name) ||
      seen.has(normalizedName)
    ) {
      return false;
    }
    seen.add(normalizedName);
    return true;
  });
}
