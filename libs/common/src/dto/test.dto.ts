import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOptionDto {
  @ApiProperty({
    required: false,
    description: 'ID estable de una opción existente',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Me gusta experimentar con química' })
  @IsString()
  text: string;

  @ApiProperty({
    example: 'A',
    required: false,
    deprecated: true,
    description:
      'Identificador histórico; las respuestas nuevas usan el ID de la opción',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  letter?: string;

  @ApiProperty({ example: 'ciencia' })
  @IsString()
  steamTrait: string;
}

export class CreateQuestionDto {
  @ApiProperty({ example: '¿Qué actividad prefieres en tu tiempo libre?' })
  @IsString()
  text: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsOptional()
  order?: number;

  @ApiProperty({ example: 'activo', required: false })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ type: [CreateOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options: CreateOptionDto[];
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiProperty({ example: 'inactivo', required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[];
}

export class CreateBulkQuestionsDto {
  @ApiProperty({ type: [CreateQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}
