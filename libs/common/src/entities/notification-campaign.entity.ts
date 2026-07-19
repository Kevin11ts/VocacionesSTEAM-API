import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notification_campaigns')
export class NotificationCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  title: string;

  @Column('text')
  message: string;

  @Column({ length: 500, nullable: true })
  url: string | null;

  @Column({ length: 40 })
  category: string;

  @Column('jsonb')
  channels: string[];

  @Column('uuid', { nullable: true })
  sentBy: string | null;

  @Column({ length: 20, default: 'processing' })
  status: string;

  @Column({ default: 0 })
  recipients: number;

  @Column({ default: 0 })
  delivered: number;

  @Column({ default: 0 })
  failed: number;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
