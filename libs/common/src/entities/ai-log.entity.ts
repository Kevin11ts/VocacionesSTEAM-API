import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('ai_logs')
export class AiLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  studentName: string;

  @Column({ nullable: true })
  detectedProfile: string;

  @Column('float')
  latency: number;

  @Column()
  success: boolean;

  @Column({ nullable: true, type: 'text' })
  errorMessage?: string;

  @Column({ default: 0 })
  tokensConsumed: number;

  @Column({ default: 'Groq' })
  provider: string;

  @CreateDateColumn()
  createdAt: Date;
}
