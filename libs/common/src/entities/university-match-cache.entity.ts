import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Caché del ranking de A8 por usuario. La IA se llama UNA vez por
 * combinación de carreras+ubicación+candidatas (cacheKey); los filtros de
 * km/costo se aplican sobre este caché sin volver a llamar a la IA.
 */
@Entity('university_match_cache')
export class UniversityMatchCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Index()
  @Column()
  cacheKey: string;

  /**
   * Ajustes validados de la IA por universidad:
   * { [universityId]: { matchScore, explanation, scoreAdjustmentReason } }
   */
  @Column('jsonb')
  aiAdjustments: Record<
    string,
    { matchScore: number; explanation: string; scoreAdjustmentReason?: string }
  >;

  /** Proveedor que generó el ajuste (Groq | deterministic). */
  @Column({ nullable: true })
  provider: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
