import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { STEAM_AXES, SteamAxis } from '../types/vocational-profile.types';
import {
  CostPreference,
  MATCH_DISTANCE_OPTIONS,
} from '../types/university-match.types';

export class RecommendedCareerDto {
  @ApiProperty({ example: 'Ingeniería en Software' })
  @IsString()
  careerName: string;

  @ApiProperty({ example: 'tecnologia', enum: STEAM_AXES })
  @IsIn(STEAM_AXES)
  axis: SteamAxis;
}

export class UserLocationDto {
  @ApiProperty({ example: 19.4326 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: -99.1332 })
  @IsNumber()
  lng: number;
}

export class UniversityMatchFiltersDto {
  @ApiProperty({ example: 30, enum: MATCH_DISTANCE_OPTIONS })
  @IsIn([...MATCH_DISTANCE_OPTIONS])
  maxDistanceKm: number;

  @ApiProperty({ example: 'any', enum: ['public', 'affordable', 'any'] })
  @IsIn(['public', 'affordable', 'any'])
  costPreference: CostPreference;
}

/** Request de POST /universities/match (A8, contrato del mandato §12). */
export class MatchUniversitiesDto {
  @ApiProperty({
    type: [RecommendedCareerDto],
    required: false,
    description:
      'Salida de A7. Si se omite, se usan las carreras del último perfil guardado.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendedCareerDto)
  recommendedCareers?: RecommendedCareerDto[];

  @ApiProperty({ type: UserLocationDto })
  @ValidateNested()
  @Type(() => UserLocationDto)
  userLocation: UserLocationDto;

  @ApiProperty({ type: UniversityMatchFiltersDto })
  @ValidateNested()
  @Type(() => UniversityMatchFiltersDto)
  filters: UniversityMatchFiltersDto;
}
