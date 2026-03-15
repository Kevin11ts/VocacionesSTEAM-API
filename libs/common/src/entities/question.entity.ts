import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Option } from './option.entity';

/**
 * Represents a question in a vocational test.
 */
@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  text: string;

  @Column({ default: 1 })
  order: number;

  @OneToMany(() => Option, (option: Option) => option.question, { cascade: true })
  options: Option[];
}
