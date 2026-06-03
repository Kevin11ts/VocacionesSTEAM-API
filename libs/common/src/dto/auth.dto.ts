import {
  IsEmail,
  IsString,
  MinLength,
  Length,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'correo@ejemplo.com',
    description: 'Correo electrónico del usuario',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email: string;

  @ApiProperty({
    example: 'Kevin Sandoval',
    description: 'Nombre completo del usuario',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(3, {
    message: 'El nombre completo debe tener al menos 3 caracteres',
  })
  fullname: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Contraseña segura (mínimo 6 caracteres)',
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;
}

export class VerifyLoginDto {
  @ApiProperty({
    example: 'correo@ejemplo.com',
    description: 'Correo electrónico',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Código OTP de 6 dígitos enviado por correo',
  })
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @Length(6, 6, {
    message: 'El código OTP debe tener exactamente 6 caracteres',
  })
  code: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    example: 'correo@ejemplo.com',
    description: 'Correo electrónico asociado al código',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Código OTP de 6 dígitos enviado por correo',
  })
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @Length(6, 6, {
    message: 'El código OTP debe tener exactamente 6 caracteres',
  })
  code: string;

  @ApiProperty({
    example: 'register',
    enum: ['register', 'recovery', 'login'],
    description: 'Propósito del código',
  })
  @IsEnum(['register', 'recovery', 'login'], {
    message: 'El propósito del código no es válido',
  })
  purpose: string;
}

export class LoginDto {
  @ApiProperty({
    example: 'correo@ejemplo.com',
    description: 'Correo electrónico registrado y verificado',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Contraseña del usuario',
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'correo@ejemplo.com',
    description: 'Correo electrónico registrado',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    example: 'correo@ejemplo.com',
    description: 'Correo electrónico registrado',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Código OTP de 6 dígitos enviado por correo',
  })
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @Length(6, 6, {
    message: 'El código OTP debe tener exactamente 6 caracteres',
  })
  code: string;

  @ApiProperty({
    example: 'NuevaPassword123!',
    description: 'Nueva contraseña (mínimo 6 caracteres)',
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, {
    message: 'La nueva contraseña debe tener al menos 6 caracteres',
  })
  @IsNotEmpty({ message: 'La nueva contraseña no puede estar vacía' })
  newPassword: string;
}

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token de acceso JWT',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Datos del usuario autenticado',
    example: {
      id: 'uuid',
      email: 'correo@ejemplo.com',
      fullname: 'Kevin Sandoval',
      settings: {
        darkMode: false,
        language: 'Español',
      },
    },
  })
  user: any;
}
