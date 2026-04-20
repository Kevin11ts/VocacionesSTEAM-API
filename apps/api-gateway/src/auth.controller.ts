import { Controller, Post, Get, Body, Inject, UseGuards, Req, Res } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { RegisterDto, VerifyOtpDto, VerifyLoginDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, LoginResponseDto } from '@app/common';
import { lastValueFrom } from 'rxjs';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthGatewayController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly configService: ConfigService,
  ) { }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User created. OTP sent.' })
  @ApiBody({ type: RegisterDto })
  async register(@Body() registerDto: RegisterDto) {
    return lastValueFrom(this.authClient.send({ cmd: 'auth.register' }, registerDto));
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify OTP code (for register or recovery)' })
  @ApiResponse({ status: 200, description: 'OTP Verified, JWT returned (except for recovery).', type: LoginResponseDto })
  @ApiBody({ type: VerifyOtpDto })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return lastValueFrom(this.authClient.send({ cmd: 'auth.verify-otp' }, verifyOtpDto));
  }

  @Post('verify-login')
  @ApiOperation({ summary: 'Verify OTP code for login (Step 2)' })
  @ApiResponse({ status: 200, description: 'OTP Verified, JWT returned.', type: LoginResponseDto })
  @ApiBody({ type: VerifyLoginDto })
  async verifyLogin(@Body() verifyLoginDto: VerifyLoginDto) {
    const payload = { ...verifyLoginDto, purpose: 'login' };
    return lastValueFrom(this.authClient.send({ cmd: 'auth.verify-otp' }, payload));
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user (Step 1)' })
  @ApiResponse({ status: 200, description: 'Credentials verified. OTP sent to email.' })
  @ApiBody({ type: LoginDto })
  async login(@Body() loginDto: LoginDto) {
    return lastValueFrom(this.authClient.send({ cmd: 'auth.login' }, loginDto));
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password recovery OTP' })
  @ApiResponse({ status: 200, description: 'OTP sent to the registered email if it exists.' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return lastValueFrom(this.authClient.send({ cmd: 'auth.forgot-password' }, forgotPasswordDto));
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using OTP' })
  @ApiResponse({ status: 200, description: 'Password updated successfully.' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return lastValueFrom(this.authClient.send({ cmd: 'auth.reset-password' }, resetPasswordDto));
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Start Google OAuth2 login flow' })
  async googleAuth(@Req() req: Request) {
    // Iniciar secuencia de OAuth con Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth2 callback' })
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const oauthRes = await lastValueFrom(this.authClient.send({ cmd: 'auth.oauth-login' }, req.user));

    // Obtenemos la URL del frontend desde las variables de entorno o usamos la por defecto
    const frontendUrl = this.configService.get('FRONTEND_URL', 'https://steamvocations.app/oauth-callback');

    return res.redirect(`${frontendUrl}?token=${oauthRes.accessToken}`);
  }
}
