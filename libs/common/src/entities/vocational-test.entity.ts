import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { AiRecommendation } from './ai-recommendation.entity';

@Entity('vocational_tests')
export class VocationalTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.tests)
  user: User;

  @Column({ nullable: true })
  testName: string;

  @Column({ type: 'jsonb' })
  answers: Record<string, string>;

  @Column({ type: 'jsonb' })
  profileScores: Record<string, number>;

  @Column()
  dominantTraits: string;

  @OneToOne(() => AiRecommendation, (rec: AiRecommendation) => rec.test, { cascade: true })
  recommendation: AiRecommendation;

  @CreateDateColumn()
  completedAt: Date;
}
