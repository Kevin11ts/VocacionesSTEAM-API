import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('universities')
export class University {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('jsonb', { nullable: true })
  location: { latitude: number; longitude: number };

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  website: string;

  @Column('jsonb', { nullable: true })
  steamPrograms: { name: string; area: string }[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
