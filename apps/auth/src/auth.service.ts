import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisterDto, VerifyOtpDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, User, OtpCode, UserSettings } from '@app/common';
import { JwtService } from '@nestjs/jwt';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(OtpCode) private readonly otpRepository: Repository<OtpCode>,
    private readonly jwtService: JwtService,
    @Inject('MAIL_SERVICE') private readonly mailClient: ClientProxy,
  ) {}

  async register(data: RegisterDto) {
    const existingUser = await this.userRepository.findOne({ where: { email: data.email } });
    if (existingUser) {
      throw new RpcException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = this.userRepository.create({
      email: data.email,
      password: hashedPassword,
      fullname: data.fullname,
      settings: new UserSettings(),
    });
    await this.userRepository.save(user);

    return this.generateAndSendOtp(data.email, 'register');
  }

  async verifyOtp(data: VerifyOtpDto) {
    const otpRecord = await this.otpRepository.findOne({ 
      where: { email: data.email, code: data.code, purpose: data.purpose } 
    });

    if (!otpRecord) {
      // Intentar encontrar cualquier OTP para este email y propósito para incrementar intentos
      const anyOtp = await this.otpRepository.findOne({ 
        where: { email: data.email, purpose: data.purpose } 
      });
      
      if (anyOtp) {
        anyOtp.attempts += 1;
        if (anyOtp.attempts >= 3) {
          await this.otpRepository.remove(anyOtp);
          throw new RpcException('Too many failed attempts. Please request a new OTP.');
        }
        await this.otpRepository.save(anyOtp);
        throw new RpcException(`Invalid OTP code. ${3 - anyOtp.attempts} attempts remaining.`);
      }
      throw new RpcException('Invalid OTP code');
    }

    if (new Date() > otpRecord.expiresAt) {
      await this.otpRepository.remove(otpRecord);
      throw new RpcException('OTP expired');
    }

    await this.otpRepository.remove(otpRecord);

    const user = await this.userRepository.findOne({ where: { email: data.email } });
    if (!user) throw new RpcException('User not found');

    if (data.purpose === 'register' && !user.isEmailVerified) {
      user.isEmailVerified = true;
      await this.userRepository.save(user);
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken: token, user };
  }

  async login(data: LoginDto) {
    const user = await this.userRepository.findOne({ where: { email: data.email } });
    if (!user || !user.password) {
      throw new RpcException('Invalid credentials');
    }

    // Verificar si la cuenta está bloqueada
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockUntil.getTime() - new Date().getTime()) / 60000);
      throw new RpcException(`Account is locked. Try again in ${remainingMinutes} minutes.`);
    }

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        const lockDuration = 30; // 30 minutos
        user.lockUntil = new Date(Date.now() + lockDuration * 60000);
        await this.userRepository.save(user);
        throw new RpcException(`Too many failed attempts. Account locked for ${lockDuration} minutes.`);
      }
      await this.userRepository.save(user);
      throw new RpcException('Invalid credentials');
    }

    // Resetear intentos en login exitoso
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await this.userRepository.save(user);

    if (!user.isEmailVerified) {
      throw new RpcException('Email is not verified');
    }

    return this.generateAndSendOtp(user.email, 'login');
  }

  async forgotPassword(data: ForgotPasswordDto) {
    const user = await this.userRepository.findOne({ where: { email: data.email } });
    if (!user) {
      // Respuesta genérica para no revelar si el correo existe
      return { message: `If ${data.email} is registered, an OTP has been sent.` };
    }

    // Solo usuarios con contraseña (no exclusivamente OAuth) pueden recuperarla
    if (!user.password) {
      throw new RpcException('This account uses Google sign-in. Password recovery is not available.');
    }

    return this.generateAndSendOtp(data.email, 'recovery');
  }

  async resetPassword(data: ResetPasswordDto) {
    const otpRecord = await this.otpRepository.findOne({
      where: { email: data.email, code: data.code, purpose: 'recovery' },
    });

    if (!otpRecord) {
      const anyOtp = await this.otpRepository.findOne({ 
        where: { email: data.email, purpose: 'recovery' } 
      });
      
      if (anyOtp) {
        anyOtp.attempts += 1;
        if (anyOtp.attempts >= 3) {
          await this.otpRepository.remove(anyOtp);
          throw new RpcException('Too many failed attempts. Please request a new OTP.');
        }
        await this.otpRepository.save(anyOtp);
        throw new RpcException(`Invalid OTP code. ${3 - anyOtp.attempts} attempts remaining.`);
      }
      throw new RpcException('Invalid OTP code');
    }

    if (new Date() > otpRecord.expiresAt) {
      await this.otpRepository.remove(otpRecord);
      throw new RpcException('OTP expired');
    }

    await this.otpRepository.remove(otpRecord);

    const user = await this.userRepository.findOne({ where: { email: data.email } });
    if (!user) throw new RpcException('User not found');

    user.password = await bcrypt.hash(data.newPassword, 10);
    await this.userRepository.save(user);

    return { message: 'Password updated successfully' };
  }

  private async generateAndSendOtp(email: string, purpose: 'register' | 'recovery' | 'login') {
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 dígitos
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await this.otpRepository.delete({ email, purpose }); // Eliminar OTPs anteriores para el mismo propósito

    const newOtp = this.otpRepository.create({ email, code, purpose, expiresAt });
    await this.otpRepository.save(newOtp);

    // Enviar mensaje asíncrono al servicio de correo
    this.mailClient.emit('mail.send-otp', { email, code, purpose });

    return { 
      message: `OTP sent to ${email}`,
      otpCode: code, // Solo para desarrollo/pruebas
    };
  }

  async oauthLogin(data: { email: string, fullname: string, avatarUrl: string, googleId: string }) {
    let user = await this.userRepository.findOne({ where: { email: data.email } });

    if (!user) {
      user = this.userRepository.create({
        email: data.email,
        fullname: data.fullname,
        avatarUrl: data.avatarUrl,
        googleId: data.googleId,
        isEmailVerified: true, // Google auth está verificado
        settings: new UserSettings(),
      });
      await this.userRepository.save(user);
    } else if (!user.googleId) {
      user.googleId = data.googleId;
      user.isEmailVerified = true;
      await this.userRepository.save(user);
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken: token, user };
  }
}
