import { RpcException } from '@nestjs/microservices';
import { TestsService } from './tests.service';

describe('TestsService admin contracts', () => {
  const service = Object.create(TestsService.prototype) as TestsService;

  const validSimulator = () => ({
    slug: '  Ciencia de Datos  ',
    careerName: 'Ciencia de Datos',
    steamArea: 'matematicas',
    estimatedDurationMinutes: 18,
    difficulty: 'Intermedia',
    status: 'activo',
    colorToken: '#123456',
    icon: 'chart-no-axes-combined',
    shortDescription: 'Analiza un conjunto de datos real.',
    tags: ['datos', ' lógica '],
    steps: [
      { id: 's1', title: 'Contexto', type: 'CONTEXT' },
      { id: 's2', title: 'Análisis', type: 'DATA_ANALYSIS' },
      { id: 's3', title: 'Decisión', type: 'TRADEOFF_DECISION' },
      { id: 's4', title: 'Sorpresa', type: 'SURPRISE_REVEAL' },
      { id: 's5', title: 'Resultado', type: 'AI_FEEDBACK' },
      { id: 's6', title: 'Reflexión', type: 'EMOTIONAL_REFLECTION' },
    ],
  });

  it('normalizes the complete simulator contract and legacy result step', () => {
    const result = (service as any).normalizeSimulatorPayload(validSimulator());

    expect(result.slug).toBe('ciencia-de-datos');
    expect(result.tags).toEqual(['datos', 'lógica']);
    expect(result.steps[4].type).toBe('REALITY_CHECK');
    expect(result.estimatedDurationMinutes).toBe(18);
  });

  it('rejects simulators that do not contain the canonical six steps', () => {
    const payload = validSimulator();
    payload.steps.pop();

    expect(() => (service as any).normalizeSimulatorPayload(payload)).toThrow(
      RpcException,
    );
  });

  it('accepts options without public letters', () => {
    expect(() =>
      (service as any).assertQuestionPayload({
        text: 'Pregunta',
        options: [
          { text: 'Uno', steamTrait: 'ciencia' },
          { text: 'Dos', steamTrait: 'tecnologia' },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects duplicated response text', () => {
    expect(() =>
      (service as any).assertQuestionPayload({
        text: 'Pregunta',
        options: [
          { text: 'La misma respuesta', steamTrait: 'ciencia' },
          { text: ' la misma respuesta ', steamTrait: 'tecnologia' },
        ],
      }),
    ).toThrow(RpcException);
  });

  it('assigns internal legacy letters while preserving existing option IDs', () => {
    const existing = new Map([
      ['option-1', { id: 'option-1', letter: 'C', text: 'Anterior' }],
    ]);

    const result = (service as any).normalizeQuestionOptions(
      [
        { id: 'option-1', text: 'Actualizada', steamTrait: 'ciencia' },
        { text: 'Nueva', steamTrait: 'tecnologia' },
      ],
      existing,
    );

    expect(result).toEqual([
      expect.objectContaining({ id: 'option-1', letter: 'C' }),
      expect.objectContaining({ letter: 'A' }),
    ]);
  });
});
