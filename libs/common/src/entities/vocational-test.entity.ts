import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { AiRecommendation } from './ai-recommendation.entity';
import { VocationalProfile } from '../types/vocational-profile.types';

@Entity('vocational_tests')
export class VocationalTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Evita duplicar historiales cuando la PWA reintenta un envío offline. */
  @Index('UQ_vocational_tests_client_submission', { unique: true })
  @Column({ type: 'uuid', nullable: true })
  clientSubmissionId: string | null;

  @ManyToOne(() => User, (user) => user.tests, { onDelete: 'CASCADE' })
  user: User;

  @Column({ nullable: true })
  testName: string;

  @Column({ type: 'jsonb' })
  answers: Record<string, string>;

  @Column({ type: 'jsonb' })
  profileScores: Record<string, number>;

  @Column()
  dominantTraits: string;

  /** Perfil vocacional completo calculado por el motor determinista (A1-A7). */
  @Column({ type: 'jsonb', nullable: true })
  profile: VocationalProfile;

  @OneToOne(() => AiRecommendation, (rec: AiRecommendation) => rec.test, {
    cascade: true,
  })
  recommendation: AiRecommendation;

  @CreateDateColumn()
  completedAt: Date;
}
