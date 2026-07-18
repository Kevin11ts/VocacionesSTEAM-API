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

  it('rejects duplicated option letters in vocational questions', () => {
    expect(() =>
      (service as any).assertQuestionPayload({
        text: 'Pregunta',
        options: [
          { text: 'Uno', letter: 'A', steamTrait: 'ciencia' },
          { text: 'Dos', letter: 'A', steamTrait: 'tecnologia' },
        ],
      }),
    ).toThrow(RpcException);
  });
});
