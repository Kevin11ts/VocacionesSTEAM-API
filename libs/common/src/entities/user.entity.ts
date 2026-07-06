import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { VocationalTest } from './vocational-test.entity';
import { SavedUniversity } from './saved-university.entity';
import { SavedCourse } from './saved-course.entity';
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

  // --- Datos de perfil editables por el usuario ---
  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ nullable: true })
  birthDate?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ nullable: true })
  github?: string;

  @Column({ nullable: true })
  linkedin?: string;

  // --- Consentimiento legal (Aviso de Privacidad + Términos) ---
  /** Versión de los documentos legales aceptada por el usuario. */
  @Column({ nullable: true })
  acceptedTermsVersion?: string;

  /** Momento en que el usuario otorgó su consentimiento. */
  @Column({ type: 'timestamp', nullable: true })
  acceptedTermsAt?: Date | null;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  googleId?: string;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockUntil?: Date | null;

  // --- Suspensión / baneo (moderación por el admin) ---
  /** Baneo permanente: la cuenta no puede iniciar sesión hasta reactivarla. */
  @Column({ default: false })
  isBanned: boolean;

  /** Suspensión temporal: la cuenta se bloquea hasta este instante. */
  @Column({ type: 'timestamp', nullable: true })
  suspendedUntil?: Date | null;

  /** Motivo de la suspensión/baneo (se muestra al usuario y queda registrado). */
  @Column({ type: 'text', nullable: true })
  suspensionReason?: string | null;

  @Column({ type: 'varchar', nullable: true })
  hashedRefreshToken?: string | null;

  @OneToOne(() => UserSettings, (settings) => settings.user, { cascade: true })
  settings: UserSettings;

  @OneToMany(() => VocationalTest, (test) => test.user)
  tests: VocationalTest[];

  @OneToMany(() => SavedUniversity, (saved) => saved.user)
  savedUniversities: SavedUniversity[];

  @OneToMany(() => SavedCourse, (saved) => saved.user)
  savedCourses: SavedCourse[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
