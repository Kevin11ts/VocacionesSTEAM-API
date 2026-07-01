import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { STEAM_AXES, SteamAxis } from '../types/vocational-profile.types';

export class CalibrationAnswerDto {
  @ApiProperty({ example: 'ingenieria', enum: STEAM_AXES })
  @IsIn(STEAM_AXES)
  axis: SteamAxis;

  @ApiProperty({ example: true })
  @IsBoolean()
  liked: boolean;
}

export class CalibrationModuleResultDto {
  @ApiProperty({ example: 'gaming_habits' })
  @IsString()
  moduleId: string;

  @ApiProperty({ type: [CalibrationAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalibrationAnswerDto)
  answers: CalibrationAnswerDto[];
}

export class SimulatorBiasFlagsDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  too_fast: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  linear_pattern_detected: boolean;
}

export class SimulatorAffinityResultDto {
  @ApiProperty({ example: 'software' })
  @IsString()
  careerSlug: string;

  @ApiProperty({ example: 'tecnologia', enum: STEAM_AXES })
  @IsIn(STEAM_AXES)
  axis: SteamAxis;

  @ApiProperty({ example: 82, description: 'Afinidad 0-100 calculada por A3a' })
  @IsNumber()
  affinity: number;

  @ApiProperty({ type: SimulatorBiasFlagsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => SimulatorBiasFlagsDto)
  biasFlags?: SimulatorBiasFlagsDto;
}

/** Request de POST /calibration/submit (contrato del mandato §12). */
export class SubmitCalibrationDto {
  @ApiProperty({ example: 'gaming_habits' })
  @IsString()
  moduleId: string;

  @ApiProperty({ type: [CalibrationAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalibrationAnswerDto)
  answers: CalibrationAnswerDto[];
}

export class SimulatorDecisionDto {
  @ApiProperty({ example: 'step_2' })
  @IsString()
  stepId: string;

  @ApiProperty({ example: 'DATA_ANALYSIS', required: false })
  @IsOptional()
  @IsString()
  stepType?: string;

  @ApiProperty({ example: 'opt_1', required: false })
  @IsOptional()
  @IsString()
  selectedOptionId?: string;

  @ApiProperty({ example: 12000, description: 'Tiempo del paso en ms' })
  @IsNumber()
  timeSpentMs: number;
}

/** Request de POST /simulator/submit (contrato del mandato §12). */
export class SubmitSimulatorDto {
  @ApiProperty({ example: 'software' })
  @IsString()
  careerSlug: string;

  @ApiProperty({ type: [SimulatorDecisionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulatorDecisionDto)
  decisions: SimulatorDecisionDto[];

  @ApiProperty({
    type: SimulatorBiasFlagsDto,
    required: false,
    description:
      'Banderas de sesgo de la sesión; si no se envían, la API las deriva de las decisiones',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SimulatorBiasFlagsDto)
  biasFlags?: SimulatorBiasFlagsDto;
}

/** Request de POST /profile/compute (contrato del mandato §12). */
export class ComputeProfileDto {
  @ApiProperty({
    example: { '1': 'A', '2': 'C' },
    description: 'Respuestas del test teórico: { [questionId]: letra }',
  })
  @IsObject()
  theoreticalAnswers: Record<string, string>;

  @ApiProperty({ type: [CalibrationModuleResultDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalibrationModuleResultDto)
  calibrationResults?: CalibrationModuleResultDto[];

  @ApiProperty({ type: [SimulatorAffinityResultDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulatorAffinityResultDto)
  simulatorResults?: SimulatorAffinityResultDto[];

  @ApiProperty({ example: 'Veracruz, México', required: false })
  @IsOptional()
  @IsString()
  locationInput?: string;
}
