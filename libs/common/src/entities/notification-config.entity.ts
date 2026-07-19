import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notification_configs')
export class NotificationConfig {
  @PrimaryColumn({ length: 50 })
  key: string;

  @Column('jsonb')
  value: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
