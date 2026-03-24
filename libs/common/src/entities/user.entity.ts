import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne } from 'typeorm';
import { VocationalTest } from './vocational-test.entity';
import { SavedUniversity } from './saved-university.entity';
import { UserSettings } from './user-settings.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password?: string;

  @Column()
  fullname: string;

  @Column({ type: 'enum', enum: ['student', 'admin'], default: 'student' })
  role: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ default: 'Explorador STEAM' })
  title: string;

  @Column({ default: 1 })
  level: number;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  googleId?: string; 

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockUntil?: Date | null;

  @OneToOne(() => UserSettings, settings => settings.user, { cascade: true })
  settings: UserSettings;

  @OneToMany(() => VocationalTest, test => test.user)
  tests: VocationalTest[];

  @OneToMany(() => SavedUniversity, saved => saved.user)
  savedUniversities: SavedUniversity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
