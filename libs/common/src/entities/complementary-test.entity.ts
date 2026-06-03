import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('complementary_tests')
export class ComplementaryTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  testId: string;

  @Column()
  testName: string;

  @Column('jsonb', { default: [] })
  questions: any[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
