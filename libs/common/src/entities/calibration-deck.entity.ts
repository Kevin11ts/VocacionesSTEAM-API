import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Una tarjeta (swipe) del deck de calibración. */
export interface CalibrationCard {
  id: string;
  text: string;
  /** Eje STEAM al que aporta: ciencia|tecnologia|ingenieria|artes|matematicas. */
  category: string;
}

/**
 * Módulo de calibración (swipe deck) administrable desde el panel.
 * Reemplaza a los decks que antes estaban hardcodeados en el frontend.
 */
@Entity('calibration_decks')
export class CalibrationDeck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identificador estable usado en la ruta /evaluations/calibration/:id. */
  @Column({ unique: true })
  moduleId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  subtitle: string;

  /** Nombre del ícono (lucide) que se muestra en el dashboard. */
  @Column({ default: 'sparkles' })
  icon: string;

  @Column({ default: 0 })
  order: number;

  @Column({ type: 'enum', enum: ['activo', 'inactivo'], default: 'activo' })
  status: string;

  @Column({ type: 'jsonb', default: [] })
  cards: CalibrationCard[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
