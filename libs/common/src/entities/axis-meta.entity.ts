import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';
import { SteamAxis } from '../types/vocational-profile.types';

/**
 * Metadatos narrativos por eje STEAM (etiqueta, adjetivo, arquetipo,
 * fortaleza, estilo de trabajo). Alimenta las plantillas deterministas
 * del perfil (nombre, resumen, fortalezas). Semillada desde AXIS_META
 * del motor local del frontend.
 */
@Entity('axis_meta')
export class AxisMeta {
  @PrimaryColumn()
  axis: SteamAxis;

  @Column()
  label: string;

  @Column()
  adjective: string;

  @Column()
  icon: string;

  @Column()
  archetype: string;

  @Column()
  strengthTitle: string;

  @Column('text')
  strengthDesc: string;

  @Column('jsonb', { default: [] })
  workStyle: string[];

  @UpdateDateColumn()
  updatedAt: Date;
}
