import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { Simulator } from './simulator.entity';
import { SimulatorOption } from './simulator-option.entity';

@Entity('simulator_steps')
export class SimulatorStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stepId: string; // The ID of the step from the data (e.g. step-1-context)

  @Column()
  type: string; // e.g. CONTEXT, TRADEOFF_DECISION

  @Column()
  title: string;

  @Column()
  content: string;

  @ManyToOne(() => Simulator, simulator => simulator.steps, { onDelete: 'CASCADE' })
  simulator: Simulator;

  @OneToMany(() => SimulatorOption, option => option.step, { cascade: true, eager: true })
  options: SimulatorOption[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
