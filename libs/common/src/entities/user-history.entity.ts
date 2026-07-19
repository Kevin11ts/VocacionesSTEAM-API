import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_histories')
export class UserHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identificador durable del envío offline que originó este historial. */
  @Index('UQ_user_histories_client_submission', { unique: true })
  @Column({ type: 'uuid', nullable: true })
  clientSubmissionId: string | null;

  /** Confirma que la evidencia ya fue incorporada al perfil del usuario. */
  @Column({ type: 'timestamptz', nullable: true })
  profileAppliedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column()
  activityType: string; // e.g., 'SIMULATOR', 'COMPLEMENTARY_TEST'

  @Column()
  activityId: string; // testId or careerId

  @Column('jsonb', { nullable: true })
  results: any; // Score, feedback, etc.

  @CreateDateColumn()
  createdAt: Date;
}
