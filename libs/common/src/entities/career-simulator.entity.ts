import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('career_simulators')
export class CareerSimulator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  careerName: string;

  @Column()
  steamArea: string;

  @Column('int')
  estimatedDurationMinutes: number;

  @Column()
  difficulty: string;

  @Column({ default: 'activo' })
  status: string;

  @Column()
  colorToken: string;

  @Column()
  icon: string;

  @Column('text')
  shortDescription: string;

  @Column('jsonb', { default: [] })
  tags: string[];

  @Column('jsonb', { default: [] })
  steps: any[];

  @Column('jsonb', { nullable: true })
  completionConfig: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
