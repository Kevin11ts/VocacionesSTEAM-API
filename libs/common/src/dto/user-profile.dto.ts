import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** PUT /users/profile — edición del propio perfil (campos no sensibles). */
export class UpdateProfileDto {
  @ApiProperty({ example: 'Ada Lovelace', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(80, { message: 'El nombre no puede exceder 80 caracteres' })
  fullname?: string;

  @ApiProperty({ example: 'Apasionada por la tecnología.', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'La biografía no puede exceder 300 caracteres' })
  bio?: string;

  @ApiProperty({ example: '2005-03-15', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  birthDate?: string;

  @ApiProperty({ example: '+52 55 1234 5678', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ example: 'Ciudad de México, México', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiProperty({ example: 'ada-lovelace', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  github?: string;

  @ApiProperty({ example: 'https://linkedin.com/in/ada', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkedin?: string;
}

/** PUT /users/password — cambio de contraseña autenticado. */
export class ChangePasswordDto {
  @ApiProperty({ example: 'miPasswordActual' })
  @IsString({ message: 'La contraseña actual es obligatoria' })
  @MinLength(1, { message: 'La contraseña actual es obligatoria' })
  currentPassword: string;

  @ApiProperty({ example: 'miNuevoPassword123' })
  @IsString({ message: 'La nueva contraseña debe ser texto' })
  @MinLength(6, {
    message: 'La nueva contraseña debe tener al menos 6 caracteres',
  })
  @MaxLength(72, { message: 'La contraseña no puede exceder 72 caracteres' })
  newPassword: string;
}

/** PUT /users/settings — preferencias del usuario (tema, idioma, notificaciones). */
export class UpdateUserSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  darkMode?: boolean;

  @ApiProperty({ required: false, example: 'Español' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  emailMarketing?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  weeklySummary?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  newCareersAlerts?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  testReminders?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  communityMessages?: boolean;
}
