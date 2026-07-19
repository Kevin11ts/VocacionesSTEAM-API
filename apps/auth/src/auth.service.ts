import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RegisterDto,
  VerifyOtpDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ResendRegistrationOtpDto,
  User,
  OtpCode,
  UserSettings,
} from '@app/common';
import { JwtService } from '@nestjs/jwt';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { lastValueFrom, timeout } from 'rxjs';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otpCooldownMs = 60_000;
  private readonly mailTimeoutMs = 15_000;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,
    private readonly jwtService: JwtService,
    @Inject('MAIL_SERVICE') private readonly mailClient: ClientProxy,
  ) {}

  async register(data: RegisterDto) {
    const email = data.email.trim().toLowerCase();
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      if (!existingUser.isEmailVerified && existingUser.password) {
        return this.generateAndSendOtp(email, 'register');
      }
      throw new RpcException('El correo electrónico ya está en uso');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      fullname: data.fullname,
      settings: new UserSettings(),
    });
    await this.userRepository.save(user);

    return this.generateAndSendOtp(email, 'register');
  }

  async resendRegistrationOtp(data: ResendRegistrationOtpDto) {
    const email = data.email.trim().toLowerCase();
    const user = await this.userRepository.findOne({ where: { email } });

    // Respuesta indistinguible para no revelar si una dirección está registrada.
    if (!user || user.isEmailVerified || !user.password) {
      return {
        message:
          'Si existe una cuenta pendiente de verificación, recibirás un nuevo código.',
        retryAfterSeconds: 60,
      };
    }

    return this.generateAndSendOtp(email, 'register');
  }

  async verifyOtp(data: VerifyOtpDto) {
    const email = data.email.trim().toLowerCase();

    const otpRecord = await this.otpRepository.findOne({
      where: { email, code: data.code, purpose: data.purpose },
    });

    if (!otpRecord) {
      // Intentar encontrar cualquier OTP para este email y propósito para incrementar intentos
      const anyOtp = await this.otpRepository.findOne({
        where: { email, purpose: data.purpose },
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

    // Recuperación solo confirma que el código es válido. No crea sesión y
    // no consume todavía el OTP: resetPassword lo vuelve a validar y lo
    // elimina atómicamente al guardar la nueva contraseña.
    if (data.purpose === 'recovery') {
      return {
        verified: true,
        message: 'Código de recuperación verificado.',
      };
    }

    await this.otpRepository.remove(otpRecord);

    const user = await this.userRepository.findOne({
      where: { email },
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
    const email = data.email.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email },
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

    // Suspensión / baneo aplicado por un administrador. Se comprueba solo
    // tras validar la contraseña, para no revelar el estado de la cuenta a
    // quien no conoce las credenciales.
    this.assertNotSuspended(user);

    if (!user.isEmailVerified) {
      throw new RpcException('El correo no está verificado');
    }

    return this.generateAndSendOtp(user.email, 'login');
  }

  async forgotPassword(data: ForgotPasswordDto) {
    const email = data.email.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email },
    });
    if (!user) {
      // Respuesta genérica para no revelar si el correo existe
      return {
        message: `Si el correo ${email} está registrado, se ha enviado un código.`,
      };
    }

    // Solo usuarios con contraseña (no exclusivamente OAuth) pueden recuperarla
    if (!user.password) {
      throw new RpcException(
        'Esta cuenta usa inicio de sesión con Google. La recuperación de contraseña no está disponible.',
      );
    }

    await this.generateAndSendOtp(email, 'recovery');
    return {
      message: `Si el correo ${email} está registrado, se ha enviado un código.`,
      retryAfterSeconds: 60,
    };
  }

  async resetPassword(data: ResetPasswordDto) {
    const email = data.email.trim().toLowerCase();
    const otpRecord = await this.otpRepository.findOne({
      where: { email, code: data.code, purpose: 'recovery' },
    });

    if (!otpRecord) {
      const anyOtp = await this.otpRepository.findOne({
        where: { email, purpose: 'recovery' },
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
      where: { email },
    });
    if (!user) throw new RpcException('Usuario no encontrado');

    user.password = await bcrypt.hash(data.newPassword, 10);
    // Una recuperación de contraseña debe cerrar las sesiones que pudieron
    // quedar en manos de quien comprometió la contraseña anterior.
    user.hashedRefreshToken = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
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
    const existingOtp = await this.otpRepository.findOne({
      where: { email, purpose },
    });
    if (existingOtp?.createdAt) {
      const elapsedMs = Date.now() - existingOtp.createdAt.getTime();
      if (elapsedMs < this.otpCooldownMs) {
        const seconds = Math.ceil((this.otpCooldownMs - elapsedMs) / 1000);
        throw new RpcException(
          `Espera ${seconds} segundos antes de solicitar otro código.`,
        );
      }
    }

    // Generador criptográficamente seguro; Math.random no es adecuado para OTP.
    const code = randomInt(100000, 1_000_000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await this.otpRepository.delete({ email, purpose }); // Eliminar OTPs anteriores para el mismo propósito

    const newOtp = this.otpRepository.create({
      email,
      code,
      purpose,
      expiresAt,
    });
    const savedOtp = await this.otpRepository.save(newOtp);

    try {
      // Request-response: solo confirmamos éxito cuando Mail/Brevo confirmó la
      // entrega. El timeout evita dejar una petición HTTP colgada.
      const delivery = await lastValueFrom(
        this.mailClient
          .send<{
            delivered: boolean;
          }>({ cmd: 'mail.send-otp' }, { email, code, purpose })
          .pipe(timeout(this.mailTimeoutMs)),
      );
      if (!delivery?.delivered) {
        throw new Error('El servicio de correo no confirmó la entrega');
      }
    } catch (error) {
      await this.otpRepository.delete({ id: savedOtp.id });
      this.logger.error(
        `No se pudo entregar OTP de propósito ${purpose} a ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new RpcException(
        'No se pudo enviar el código por correo. Intenta de nuevo más tarde.',
      );
    }

    return {
      message: 'Código enviado por correo.',
      retryAfterSeconds: 60,
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

    // También aquí, para que un baneo no se pueda evadir entrando por Google.
    this.assertNotSuspended(user);

    const { password: _, ...safeUser } = user;
    const tokens = await this.generateTokens(user);
    return { ...tokens, user: safeUser };
  }

  /**
   * Lanza si la cuenta está baneada permanentemente o suspendida y la
   * suspensión todavía no venció. La suspensión vencida se limpia sola.
   */
  private assertNotSuspended(user: User) {
    if (user.isBanned) {
      throw new RpcException(
        user.suspensionReason
          ? `Tu cuenta ha sido suspendida permanentemente. Motivo: ${user.suspensionReason}`
          : 'Tu cuenta ha sido suspendida permanentemente. Contacta a soporte.',
      );
    }
    if (user.suspendedUntil && user.suspendedUntil > new Date()) {
      const fecha = user.suspendedUntil.toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      throw new RpcException(
        user.suspensionReason
          ? `Tu cuenta está suspendida hasta el ${fecha}. Motivo: ${user.suspensionReason}`
          : `Tu cuenta está suspendida hasta el ${fecha}.`,
      );
    }
  }

  /**
   * Fuente de verdad para cada request autenticado. El gateway no confía en
   * el rol/estado congelado dentro del JWT: consulta la cuenta vigente y falla
   * cerrado si fue eliminada, desverificada, suspendida o baneada.
   */
  async validateSession(userId: string): Promise<{
    active: boolean;
    message?: string;
    user?: { id: string; email: string; role: string };
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return { active: false, message: 'La cuenta ya no existe.' };
    if (user.isBanned) {
      return {
        active: false,
        message: user.suspensionReason
          ? `Cuenta suspendida permanentemente: ${user.suspensionReason}`
          : 'Cuenta suspendida permanentemente.',
      };
    }
    if (user.suspendedUntil && user.suspendedUntil > new Date()) {
      return {
        active: false,
        message: user.suspensionReason
          ? `Cuenta suspendida: ${user.suspensionReason}`
          : 'Cuenta suspendida temporalmente.',
      };
    }
    if (!user.isEmailVerified) {
      return { active: false, message: 'El correo no está verificado.' };
    }

    if (user.suspendedUntil || user.suspensionReason) {
      user.suspendedUntil = null;
      user.suspensionReason = null;
      await this.userRepository.save(user);
    }

    return {
      active: true,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async generateTokens(user: User) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '7d' },
    );

    user.hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.save(user);

    return { accessToken, refreshToken };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings'],
    });
    if (!user || !user.hashedRefreshToken) {
      throw new RpcException('Acceso denegado');
    }

    this.assertNotSuspended(user);
    if (!user.isEmailVerified) {
      throw new RpcException('El correo no está verificado');
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
