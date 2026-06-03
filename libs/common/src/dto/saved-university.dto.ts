import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSavedUniversityDto {
  @ApiProperty({ example: 'Ingeniería en Sistemas Computacionales' })
  @IsString()
  careerName: string;

  @ApiProperty({ example: 'Instituto Tecnológico Nacional' })
  @IsString()
  universityName: string;

  @ApiProperty({
    example: 'Av. Universidad 123, Ciudad de México',
    required: false,
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({
    example:
      'Esta carrera concuerda fuertemente con tus habilidades analíticas.',
    required: false,
  })
  @IsString()
  @IsOptional()
  relationshipExplanation?: string;

  @ApiProperty({
    example: 'Inscripciones abiertas del 1 al 15 de agosto.',
    required: false,
  })
  @IsString()
  @IsOptional()
  keyDates?: string;

  @ApiProperty({
    example: '1er Semestre: Matemáticas, Programación...',
    required: false,
  })
  @IsString()
  @IsOptional()
  studyPlan?: string;

  @ApiProperty({ example: 'https://www.unam.mx', required: false })
  @IsString()
  @IsOptional()
  officialWebsite?: string;
}
