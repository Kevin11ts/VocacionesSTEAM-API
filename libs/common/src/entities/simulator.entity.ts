import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SimulatorStep } from './simulator-step.entity';

@Entity('simulators')
export class Simulator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  careerId: string;

  @Column()
  careerName: string;

  @Column()
  steamAreaName: string;

  @Column()
  description: string;

  @OneToMany(() => SimulatorStep, step => step.simulator, { cascade: true, eager: true })
  steps: SimulatorStep[];

  @Column('jsonb', { default: [] })
  feedbackRules: any[]; // Stores the rule logic tree

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
