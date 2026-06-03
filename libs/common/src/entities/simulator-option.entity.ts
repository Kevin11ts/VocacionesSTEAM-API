import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { SimulatorStep } from './simulator-step.entity';

@Entity('simulator_options')
export class SimulatorOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  optionId: string; // e.g., opt1, opt2

  @Column()
  text: string;

  @Column('jsonb', { nullable: true })
  steamTraitWeight: any; // e.g., { tecnologia: 5, ingenieria: -2 }

  @ManyToOne(() => SimulatorStep, (step) => step.options, {
    onDelete: 'CASCADE',
  })
  step: SimulatorStep;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
