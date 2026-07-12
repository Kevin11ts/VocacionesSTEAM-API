import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CostTier } from '../types/university-match.types';

@Entity('universities')
export class University {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('jsonb', { nullable: true })
  location: { latitude: number; longitude: number };

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  website: string;

  @Column('jsonb', { nullable: true })
  steamPrograms: { name: string; area: string }[];

  /** Dato duro para A8: public | affordable | private-premium. */
  @Column({ type: 'varchar', nullable: true })
  costTier: CostTier;

  /** Rango de colegiatura legible (contexto para la IA, no se inventa). */
  @Column({ nullable: true })
  tuitionRange: string;

  /** Rating de Google Maps (0-5), administrado en BD. */
  @Column('float', { nullable: true })
  rating: number;

  /** presencial | en línea | híbrida. */
  @Column({ nullable: true })
  modality: string;

  /** Fecha/periodo de examen de admisión, ficha o convocatoria (texto libre, solo si el sitio lo menciona explícitamente). */
  @Column({ nullable: true })
  admissionDates: string;

  /**
   * Rastro de auditoría del enriquecimiento automático por IA (Groq), para
   * poder revisar o revertir después sin bloquear el guardado automático.
   */
  @Column({ type: 'timestamp', nullable: true })
  aiEnrichedAt: Date | null;

  /** URL del sitio oficial que se descargó y se pasó a la IA para ese enriquecimiento. */
  @Column({ nullable: true })
  aiEnrichmentSource: string;

  /** place_id de Google Places, cuando el registro vino de ahí — evita re-descubrir/re-pedir Details del mismo lugar. */
  @Column({ nullable: true })
  googlePlaceId: string;

  /** Origen del registro: 'manual' | 'discovery_admin' | 'denue' | 'nearby_ai_pipeline'. */
  @Column({ type: 'varchar', nullable: true })
  source: string;

  /** Clasificación que asignó la IA (university, technological_institute, unverified, etc.) al validar un candidato nuevo. */
  @Column({ nullable: true })
  institutionType: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
