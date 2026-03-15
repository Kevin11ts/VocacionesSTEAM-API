import { Controller, Post, Get, Body, Inject, UseGuards, Req, Res } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { RegisterDto, VerifyOtpDto, LoginDto } from '@app/common';
import { lastValueFrom } from 'rxjs';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthGatewayController {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User created. OTP sent.' })
  @ApiBody({ type: RegisterDto })
  async register(@Body() registerDto: RegisterDto) {
    return lastValueFrom(this.authClient.send({ cmd: 'auth.register' }, registerDto));
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify OTP code' })
  @ApiResponse({ status: 200, description: 'OTP Verified, JWT returned.' })
  @ApiBody({ type: VerifyOtpDto })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return lastValueFrom(this.authClient.send({ cmd: 'auth.verify-otp' }, verifyOtpDto));
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful, JWT returned.' })
  @ApiBody({ type: LoginDto })
  async login(@Body() loginDto: LoginDto) {
    return lastValueFrom(this.authClient.send({ cmd: 'auth.login' }, loginDto));
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
    // El frontend típicamente espera una redirección con el token en los parámetros de consulta o cookies.
    // Asumiendo que la PWA está en https://steamvocations.app/oauth-callback
    const frontendUrl = 'https://steamvocations.app/oauth-callback';
    return res.redirect(`${frontendUrl}?token=${oauthRes.accessToken}`);
  }
}
