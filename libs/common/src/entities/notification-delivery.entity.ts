import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('notification_deliveries')
export class NotificationDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index()
  @Column('uuid')
  userId: string;

  @Column({ length: 20 })
  channel: string;

  @Column({ length: 40 })
  type: string;

  @Column({ length: 20 })
  status: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180, nullable: true })
  dedupeKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recipient: string | null;

  @Column('text', { nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
