import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SteamAxis } from '../types/vocational-profile.types';

/**
 * Catálogo de vocaciones agrupadas por eje STEAM (algoritmo A6).
 * La afinidad NO se guarda aquí: se calcula en runtime con
 * clamp(round(score*0.85 + 12)).
 */
@Entity('vocation_catalog')
export class VocationCatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  axis: SteamAxis;

  @Column()
  name: string;

  @Column('text')
  description: string;

  @Column('jsonb', { default: [] })
  skills: string[];

  @Column()
  icon: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
