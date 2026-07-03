import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('saved_universities')
export class SavedUniversity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.savedUniversities, {
    onDelete: 'CASCADE',
  })
  user: User;

  @Column()
  careerName: string;

  @Column()
  universityName: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'text', nullable: true })
  relationshipExplanation: string;

  @Column({ type: 'text', nullable: true })
  keyDates: string;

  @Column({ type: 'text', nullable: true })
  studyPlan: string;

  @Column({ nullable: true })
  officialWebsite: string;

  /** Coordenadas reales de la universidad, para poder mostrarla en el mapa. */
  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  /** Rating de Google (0-5) al momento de guardar, si estaba disponible. */
  @Column({ type: 'double precision', nullable: true })
  rating: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
