import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('saved_courses')
export class SavedCourse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.savedCourses, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  provider: string; // quien imparte el curso

  @Column()
  courseName: string; // nombre del curso

  @Column()
  durationHours: number; // duración en horas

  @Column()
  isFree: boolean; // gratis o de paga

  @Column({ type: 'text' })
  description: string; // descripción

  @Column({ type: 'text' })
  syllabus: string; // Temario (Syllabus)

  @Column()
  link: string; // link del curso

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
