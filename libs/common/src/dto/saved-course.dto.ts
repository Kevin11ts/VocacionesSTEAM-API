import { IsString, IsNumber, IsBoolean, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSavedCourseDto {
  @ApiProperty({ example: 'Coursera / Universidad de Stanford' })
  @IsString()
  provider: string;

  @ApiProperty({ example: 'Introducción a la Inteligencia Artificial' })
  @IsString()
  courseName: string;

  @ApiProperty({ example: 40 })
  @IsNumber()
  durationHours: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  isFree: boolean;

  @ApiProperty({ example: 'Aprende los fundamentos del Machine Learning y Deep Learning...' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'Módulo 1: Conceptos básicos\nMódulo 2: Redes Neuronales...' })
  @IsString()
  syllabus: string;

  @ApiProperty({ example: 'https://coursera.org/learn/ai' })
  @IsUrl()
  @IsString()
  link: string;
}
