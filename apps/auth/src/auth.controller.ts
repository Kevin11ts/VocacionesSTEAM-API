import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  VerifyOtpDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '@app/common';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern({ cmd: 'auth.register' })
  async register(@Payload() payload: RegisterDto) {
    return this.authService.register(payload);
  }

  @MessagePattern({ cmd: 'auth.verify-otp' })
  async verifyOtp(@Payload() payload: VerifyOtpDto) {
    return this.authService.verifyOtp(payload);
  }

  @MessagePattern({ cmd: 'auth.login' })
  async login(@Payload() payload: LoginDto) {
    return this.authService.login(payload);
  }

  @MessagePattern({ cmd: 'auth.oauth-login' })
  async oauthLogin(
    @Payload()
    payload: {
      email: string;
      fullname: string;
      avatarUrl: string;
      googleId: string;
    },
  ) {
    return this.authService.oauthLogin(payload);
  }

  @MessagePattern({ cmd: 'auth.forgot-password' })
  async forgotPassword(@Payload() payload: ForgotPasswordDto) {
    return this.authService.forgotPassword(payload);
  }

  @MessagePattern({ cmd: 'auth.reset-password' })
  async resetPassword(@Payload() payload: ResetPasswordDto) {
    return this.authService.resetPassword(payload);
  }
}
