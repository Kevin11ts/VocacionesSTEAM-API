import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_settings')
export class UserSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, user => user.settings)
  @JoinColumn()
  user: User;

  @Column({ default: false })
  darkMode: boolean;

  @Column({ default: 'Español' })
  language: string;

  @Column({ default: true })
  pushEnabled: boolean;

  @Column({ default: false })
  emailMarketing: boolean;
}
