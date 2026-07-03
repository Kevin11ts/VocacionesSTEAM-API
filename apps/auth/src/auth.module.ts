import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  CommonModule,
  User,
  OtpCode,
  UserSettings,
  VocationalTest,
  AiRecommendation,
  SavedUniversity,
  SavedCourse,
} from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      User,
      OtpCode,
      UserSettings,
      VocationalTest,
      AiRecommendation,
      SavedUniversity,
      SavedCourse,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // Access token de 1h: reduce ~4x la frecuencia de refresh (antes 15m)
        // y por ende las ventanas donde un blip de red podía cerrar sesión.
        // El refresh token sigue durando 7d (ver generateTokens).
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_EXPIRATION') ||
            '1h') as any,
        },
      }),
    }),
    ClientsModule.registerAsync([
      {
        name: 'MAIL_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('HOST_MAIL', '127.0.0.1'),
            port: config.get<number>('PORT_MAIL', 3005),
          },
        }),
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
