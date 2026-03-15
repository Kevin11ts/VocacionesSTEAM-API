import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { VocationalTest } from './vocational-test.entity';

@Entity('ai_recommendations')
export class AiRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => VocationalTest, test => test.recommendation)
  @JoinColumn()
  test: VocationalTest;

  @Column()
  locationInput: string;

  @Column({ type: 'jsonb' })
  universities: any;

  @Column({ type: 'text' })
  aiGeneralAdvice: string;
}
