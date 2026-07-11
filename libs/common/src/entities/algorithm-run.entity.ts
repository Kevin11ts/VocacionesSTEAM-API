import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Bitácora de ejecuciones del Motor Vocacional API (servicio externo con
 * los algoritmos A0-A8). Persiste el resultado, las métricas y el tiempo
 * de ejecución de cada corrida para que sean consultables desde la app.
 */
@Entity('algorithm_runs')
export class AlgorithmRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Algoritmo ejecutado en el motor: A0 (madre), A1..A8. */
  @Index()
  @Column()
  algorithm: string;

  /** Versión del algoritmo reportada por el motor. */
  @Column({ nullable: true })
  engineVersion: string;

  /** Versión del contrato del perfil (RG-8), si aplica. */
  @Column({ nullable: true })
  profileVersion: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Tiempo total de ejecución reportado por el motor (ms). */
  @Column({ type: 'float' })
  executionTimeMs: number;

  /** Desglose de tiempos por algoritmo del pipeline (solo A0). */
  @Column({ type: 'jsonb', nullable: true })
  breakdown: unknown;

  /** Resultado devuelto por el motor (VocationalProfile, matches, etc.). */
  @Column({ type: 'jsonb' })
  result: unknown;

  /** Si la capa de IA participó (solo A8). */
  @Column({ default: false })
  aiUsed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
