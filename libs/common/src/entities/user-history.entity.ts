import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_histories')
export class UserHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
