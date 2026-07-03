import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_settings')
export class UserSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.settings, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ default: false })
  darkMode: boolean = false;

  @Column({ default: 'Español' })
  language: string = 'Español';

  // --- Canales de notificación ---
  @Column({ default: true })
  pushEnabled: boolean = true;

  @Column({ default: true })
  emailEnabled: boolean = true;

  @Column({ default: false })
  emailMarketing: boolean = false;

  // --- Categorías de notificación ---
  @Column({ default: true })
  weeklySummary: boolean = true;

  @Column({ default: true })
  newCareersAlerts: boolean = true;

  @Column({ default: true })
  testReminders: boolean = true;

  @Column({ default: false })
  communityMessages: boolean = false;
}
