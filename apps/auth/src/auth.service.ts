import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RegisterDto,
  VerifyOtpDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  User,
  OtpCode,
  UserSettings,
} from '@app/common';
import { JwtService } from '@nestjs/jwt';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,
    private readonly jwtService: JwtService,
    @Inject('MAIL_SERVICE') private readonly mailClient: ClientProxy,
  ) {}

  async register(data: RegisterDto) {
    const existingUser = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (existingUser) {
      throw new RpcException('El correo electrónico ya está en uso');
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
      where: { email: data.email, code: data.code, purpose: data.purpose },
    });

    if (!otpRecord) {
      // Intentar encontrar cualquier OTP para este email y propósito para incrementar intentos
      const anyOtp = await this.otpRepository.findOne({
        where: { email: data.email, purpose: data.purpose },
      });

      if (anyOtp) {
        anyOtp.attempts += 1;
        if (anyOtp.attempts >= 3) {
          await this.otpRepository.remove(anyOtp);
          throw new RpcException(
            'Demasiados intentos fallidos. Por favor, solicita un nuevo código.',
          );
        }
        await this.otpRepository.save(anyOtp);
        throw new RpcException(
          `Código inválido. Te quedan ${3 - anyOtp.attempts} intentos.`,
        );
      }
      throw new RpcException('Código inválido');
    }

    if (new Date() > otpRecord.expiresAt) {
      await this.otpRepository.remove(otpRecord);
      throw new RpcException('El código ha expirado');
    }

    await this.otpRepository.remove(otpRecord);

    const user = await this.userRepository.findOne({
      where: { email: data.email },
      relations: ['settings'],
    });
    if (!user) throw new RpcException('Usuario no encontrado');

    if (data.purpose === 'register' && !user.isEmailVerified) {
      user.isEmailVerified = true;
      await this.userRepository.save(user);
    }

    const { password: _, ...safeUser } = user;
    const tokens = await this.generateTokens(user);
    return { ...tokens, user: safeUser };
  }

  async login(data: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (!user || !user.password) {
      throw new RpcException('Credenciales inválidas');
    }

    // Verificar si la cuenta está bloqueada
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockUntil.getTime() - new Date().getTime()) / 60000,
      );
      throw new RpcException(
        `Cuenta bloqueada. Intenta de nuevo en ${remainingMinutes} minutos.`,
      );
    }

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        const lockDuration = 30; // 30 minutos
        user.lockUntil = new Date(Date.now() + lockDuration * 60000);
        await this.userRepository.save(user);
        throw new RpcException(
          `Demasiados intentos fallidos. Cuenta bloqueada por ${lockDuration} minutos.`,
        );
      }
      await this.userRepository.save(user);
      throw new RpcException('Credenciales inválidas');
    }

    // Resetear intentos en login exitoso
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await this.userRepository.save(user);

    if (!user.isEmailVerified) {
      throw new RpcException('El correo no está verificado');
    }

    return this.generateAndSendOtp(user.email, 'login');
  }

  async forgotPassword(data: ForgotPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (!user) {
      // Respuesta genérica para no revelar si el correo existe
      return {
        message: `Si el correo ${data.email} está registrado, se ha enviado un código.`,
      };
    }

    // Solo usuarios con contraseña (no exclusivamente OAuth) pueden recuperarla
    if (!user.password) {
      throw new RpcException(
        'Esta cuenta usa inicio de sesión con Google. La recuperación de contraseña no está disponible.',
      );
    }

    return this.generateAndSendOtp(data.email, 'recovery');
  }

  async resetPassword(data: ResetPasswordDto) {
    const otpRecord = await this.otpRepository.findOne({
      where: { email: data.email, code: data.code, purpose: 'recovery' },
    });

    if (!otpRecord) {
      const anyOtp = await this.otpRepository.findOne({
        where: { email: data.email, purpose: 'recovery' },
      });

      if (anyOtp) {
        anyOtp.attempts += 1;
        if (anyOtp.attempts >= 3) {
          await this.otpRepository.remove(anyOtp);
          throw new RpcException(
            'Demasiados intentos fallidos. Por favor, solicita un nuevo código.',
          );
        }
        await this.otpRepository.save(anyOtp);
        throw new RpcException(
          `Código inválido. Te quedan ${3 - anyOtp.attempts} intentos.`,
        );
      }
      throw new RpcException('Código inválido');
    }

    if (new Date() > otpRecord.expiresAt) {
      await this.otpRepository.remove(otpRecord);
      throw new RpcException('El código ha expirado');
    }

    await this.otpRepository.remove(otpRecord);

    const user = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (!user) throw new RpcException('Usuario no encontrado');

    user.password = await bcrypt.hash(data.newPassword, 10);
    await this.userRepository.save(user);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  /**
   * Cambio de contraseña de un usuario autenticado: verifica la contraseña
   * actual, guarda la nueva hasheada e invalida los refresh tokens (fuerza
   * re-login en otros dispositivos como medida de seguridad).
   */
  async changePassword(data: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }) {
    const user = await this.userRepository.findOne({
      where: { id: data.userId },
    });
    if (!user) throw new RpcException('Usuario no encontrado');

    // Cuentas creadas por Google OAuth pueden no tener contraseña local.
    if (!user.password) {
      throw new RpcException(
        'Tu cuenta usa inicio de sesión con Google. No tiene contraseña que cambiar.',
      );
    }

    const isMatch = await bcrypt.compare(data.currentPassword, user.password);
    if (!isMatch) {
      throw new RpcException('La contraseña actual es incorrecta');
    }

    const sameAsOld = await bcrypt.compare(data.newPassword, user.password);
    if (sameAsOld) {
      throw new RpcException(
        'La nueva contraseña debe ser distinta a la actual',
      );
    }

    user.password = await bcrypt.hash(data.newPassword, 10);
    // Invalidar sesiones existentes: el refresh token deja de ser válido.
    user.hashedRefreshToken = null as any;
    await this.userRepository.save(user);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  private async generateAndSendOtp(
    email: string,
    purpose: 'register' | 'recovery' | 'login',
  ) {
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 dígitos
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await this.otpRepository.delete({ email, purpose }); // Eliminar OTPs anteriores para el mismo propósito

    const newOtp = this.otpRepository.create({
      email,
      code,
      purpose,
      expiresAt,
    });
    await this.otpRepository.save(newOtp);

    // Enviar mensaje asíncrono al servicio de correo
    this.mailClient.emit('mail.send-otp', { email, code, purpose });

    return {
      message: `Código enviado a ${email}`,
      otpCode: code, // Solo para desarrollo/pruebas
    };
  }

  async oauthLogin(data: {
    email: string;
    fullname: string;
    avatarUrl: string;
    googleId: string;
  }) {
    let user = await this.userRepository.findOne({
      where: { email: data.email },
      relations: ['settings'],
    });

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

    const { password: _, ...safeUser } = user;
    const tokens = await this.generateTokens(user);
    return { ...tokens, user: safeUser };
  }

  async generateTokens(user: User) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '7d' }
    );

    user.hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.save(user);

    return { accessToken, refreshToken };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['settings'] });
    if (!user || !user.hashedRefreshToken) {
      throw new RpcException('Acceso denegado');
    }

    const isMatch = await bcrypt.compare(refreshToken, user.hashedRefreshToken);
    if (!isMatch) {
      throw new RpcException('Acceso denegado');
    }

    const tokens = await this.generateTokens(user);
    const { password: _, ...safeUser } = user;
    return { ...tokens, user: safeUser };
  }
}
