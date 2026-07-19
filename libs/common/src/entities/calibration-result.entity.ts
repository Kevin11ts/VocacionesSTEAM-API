import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('calibration_results')
export class CalibrationResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identificador durable del envío offline que originó este resultado. */
  @Index('UQ_calibration_results_client_submission', { unique: true })
  @Column({ type: 'uuid', nullable: true })
  clientSubmissionId: string | null;

  /** Confirma que la evidencia ya fue incorporada al perfil del usuario. */
  @Column({ type: 'timestamptz', nullable: true })
  profileAppliedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  moduleId: string;

  @Column('jsonb')
  answers: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
