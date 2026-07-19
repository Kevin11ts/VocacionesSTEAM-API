import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {
    // Sin fallback: un secreto por defecto conocido (p. ej. "super-secret")
    // permitiría forjar tokens válidos —con cualquier rol— si esta variable
    // no llega a estar configurada en el entorno. Mejor fallar al arrancar.
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET no está configurado. Defínelo antes de iniciar el servicio.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    try {
      const state = await lastValueFrom(
        this.authClient
          .send<{
            active: boolean;
            message?: string;
            user?: { id: string; email: string; role: string };
          }>({ cmd: 'auth.validate-session' }, payload.sub)
          .pipe(timeout(5000)),
      );

      if (!state?.active || !state.user) {
        throw new UnauthorizedException(
          state?.message || 'La sesión ya no está autorizada.',
        );
      }

      // Rol y correo salen de BD, no del JWT emitido antes de una moderación.
      return state.user;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // Si Auth/BD no puede confirmar la cuenta, la autorización falla cerrada.
      throw new UnauthorizedException(
        'No fue posible validar el estado actual de la sesión.',
      );
    }
  }
}
