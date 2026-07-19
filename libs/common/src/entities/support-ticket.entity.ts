import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('UQ_support_tickets_reference', { unique: true })
  @Column({ length: 32 })
  reference: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'support_tickets_userId_fkey',
  })
  user: User;

  @Index('IDX_support_tickets_user')
  @Column('uuid')
  userId: string;

  @Column({ length: 30 })
  category: string;

  @Column({ length: 140 })
  subject: string;

  @Column('text')
  message: string;

  @Index('IDX_support_tickets_status')
  @Column({ length: 20, default: 'open' })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  attachmentName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  attachmentMimeType: string | null;

  @Column({ type: 'integer', nullable: true })
  attachmentSize: number | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  attachmentData: Buffer | null;

  @Column('text', { nullable: true })
  adminReply: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
