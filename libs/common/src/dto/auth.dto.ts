import { IsEmail, IsString, MinLength, Length, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'correo@ejemplo.com', description: 'Correo electrónico del usuario' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Kevin Sandoval', description: 'Nombre completo del usuario' })
  @IsString()
  @MinLength(3)
  fullname: string;

  @ApiProperty({ example: 'Password123!', description: 'Contraseña segura (mínimo 6 caracteres)' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'correo@ejemplo.com', description: 'Correo electrónico asociado al código' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', description: 'Código OTP de 6 dígitos enviado por correo' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({ example: 'register', enum: ['register', 'recovery', 'login'], description: 'Propósito del código' })
  @IsEnum(['register', 'recovery', 'login'])
  purpose: string;
}

export class LoginDto {
  @ApiProperty({ example: 'correo@ejemplo.com', description: 'Correo electrónico registrado y verificado' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', description: 'Contraseña del usuario' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'correo@ejemplo.com', description: 'Correo electrónico registrado' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'correo@ejemplo.com', description: 'Correo electrónico registrado' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', description: 'Código OTP de 6 dígitos enviado por correo' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({ example: 'NuevaPassword123!', description: 'Nueva contraseña (mínimo 6 caracteres)' })
  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  newPassword: string;
}
