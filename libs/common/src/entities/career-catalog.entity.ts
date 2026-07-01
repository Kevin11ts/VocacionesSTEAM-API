import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SteamAxis } from '../types/vocational-profile.types';

/**
 * Catálogo de carreras / planes de estudio agrupadas por eje STEAM
 * (algoritmo A7). La afinidad y el rationale se calculan en runtime.
 */
@Entity('career_catalog')
export class CareerCatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  axis: SteamAxis;

  @Column()
  careerName: string;

  @Column('jsonb', { default: [] })
  studyPlanHighlights: string[];

  @Column('jsonb', { default: [] })
  careerFields: string[];

  @Column({ nullable: true })
  relatedSimulatorSlug: string;

  @Column()
  icon: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
