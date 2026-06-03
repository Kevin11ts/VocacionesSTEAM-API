import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Question } from './question.entity';

/**
 * Represents a selectable option for a vocational test question.
 */
@Entity('options')
export class Option {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  text: string;

  @Column({ length: 1 })
  letter: string; // A, B, C, D

  @Column()
  steamTrait: string; // ciencia, tecnologia, ingenieria, arte, matematicas

  @ManyToOne(() => Question, (question: Question) => question.options, {
    onDelete: 'CASCADE',
  })
  question: Question;
}
