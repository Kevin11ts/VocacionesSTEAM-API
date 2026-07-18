import {
  extractInstitutionScope,
  recommendationPrograms,
  verifyProgramsAgainstOfficialPages,
} from './program-verification';

describe('Verificación de oferta académica oficial', () => {
  const pages = [
    {
      url: 'https://universidad.mx/licenciaturas',
      text:
        'Arquitectura CÓRDOBA VERACRUZ. Ingeniería Industrial CÓRDOBA OAXACA. ' +
        'Ingeniería en Software VERACRUZ.',
    },
  ];

  it('acepta únicamente carreras cuyo nombre aparece en la página oficial', () => {
    expect(
      verifyProgramsAgainstOfficialPages(
        [
          { name: 'Arquitectura', area: 'artes' },
          { name: 'Ingeniería Aeroespacial', area: 'ingenieria' },
        ],
        pages,
        'Universidad Ejemplo',
      ),
    ).toEqual([
      {
        name: 'Arquitectura',
        area: 'artes',
        sourceUrl: 'https://universidad.mx/licenciaturas',
      },
    ]);
  });

  it('exige evidencia del campus cuando el nombre representa una sede', () => {
    const result = verifyProgramsAgainstOfficialPages(
      [
        { name: 'Arquitectura', area: 'artes' },
        { name: 'Ingeniería en Software', area: 'tecnologia' },
      ],
      pages,
      'Universidad Ejemplo, Campus Córdoba',
    );
    expect(result.map((program) => program.name)).toEqual(['Arquitectura']);
  });

  it('no atribuye al campus actual una carrera seguida por el nombre de otra sede', () => {
    const result = verifyProgramsAgainstOfficialPages(
      [{ name: 'Inglés', area: 'artes' }],
      [
        {
          url: 'https://universidad.mx/licenciaturas',
          text: 'Inglés ORIZABA I Lenguas CÓRDOBA I Administración CÓRDOBA',
        },
      ],
      'Universidad Ejemplo, Campus Córdoba',
    );
    expect(result).toEqual([]);
  });

  it('descarta agrupaciones académicas aunque aparezcan en el sitio', () => {
    expect(
      verifyProgramsAgainstOfficialPages(
        [{ name: 'Ciencias de la Salud', area: 'ciencia' }],
        [{ url: 'https://universidad.mx', text: 'Ciencias de la Salud' }],
        'Universidad Ejemplo',
      ),
    ).toEqual([]);
  });

  it('exige el nombre como frase completa y no como parte de otra palabra', () => {
    expect(
      verifyProgramsAgainstOfficialPages(
        [{ name: 'Arquitectura', area: 'artes' }],
        [
          {
            url: 'https://universidad.mx',
            text: 'Taller de Arquitecturas Digitales',
          },
        ],
        'Universidad Ejemplo',
      ),
    ).toEqual([]);
  });

  it('extrae campus, plantel o sede del nombre', () => {
    expect(extractInstitutionScope('Universidad X, Campus Córdoba')).toBe(
      'Córdoba',
    );
    expect(extractInstitutionScope('Universidad X Plantel Centro')).toBe(
      'Centro',
    );
    expect(extractInstitutionScope('Universidad X')).toBeNull();
  });

  it('oculta catálogos automáticos antiguos que nunca fueron verificados', () => {
    const catalog = {
      source: 'nearby_ai_pipeline',
      steamPrograms: [{ name: 'Ingeniería Inventada', area: 'ingenieria' }],
    };
    expect(recommendationPrograms(catalog)).toEqual([]);
    expect(
      recommendationPrograms({ ...catalog, programsVerifiedAt: new Date() }),
    ).toHaveLength(1);
  });
});
