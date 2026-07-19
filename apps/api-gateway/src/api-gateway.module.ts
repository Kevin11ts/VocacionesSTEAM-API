import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthGatewayController } from './auth.controller';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import { UsersGatewayController } from './users.controller';
import { TestsGatewayController } from './tests.controller';
import { AiLogsGatewayController } from './ai-logs.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import {
  UniversitiesController,
  AdminUniversitiesController,
} from './universities.controller';
import {
  CareerSimulatorsController,
  AdminCareerSimulatorsController,
} from './career-simulators.controller';
import { AdminQuestionsController } from './admin-questions.controller';
import {
  ComplementaryTestsController,
  AdminComplementaryTestsController,
} from './complementary-tests.controller';
import {
  AdminStatsController,
  AdminSystemController,
} from './admin.controller';
import { RolesGuard } from './guards/roles.guard';
import {
  CareersController,
  AdminCareersCatalogController,
} from './careers.controller';
import {
  ProfileGatewayController,
  CalibrationGatewayController,
  SimulatorGatewayController,
} from './profile.controller';
import {
  CalibrationDecksController,
  AdminCalibrationDecksController,
} from './calibration-decks.controller';
import { MotorGatewayController } from './motor.controller';
import {
  AdminSupportGatewayController,
  SupportGatewayController,
} from './support.controller';
import {
  AdminNotificationsGatewayController,
  NotificationsGatewayController,
} from './notifications.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    ClientsModule.registerAsync([
      {
        name: 'AUTH_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('HOST_AUTH', '127.0.0.1'),
            port: config.get<number>('PORT_AUTH', 3001),
          },
        }),
      },
      {
        name: 'USERS_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('HOST_USERS', '127.0.0.1'),
            port: config.get<number>('PORT_USERS', 3002),
          },
        }),
      },
      {
        name: 'TESTS_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('HOST_TESTS', '127.0.0.1'),
            port: config.get<number>('PORT_TESTS', 3003),
          },
        }),
      },
      {
        name: 'AI_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('HOST_AI', '127.0.0.1'),
            port: config.get<number>('PORT_AI', 3004),
          },
        }),
      },
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
  controllers: [
    ApiGatewayController,
    AuthGatewayController,
    UsersGatewayController,
    TestsGatewayController,
    AiLogsGatewayController,
    UniversitiesController,
    AdminUniversitiesController,
    CareerSimulatorsController,
    AdminCareerSimulatorsController,
    AdminQuestionsController,
    ComplementaryTestsController,
    AdminComplementaryTestsController,
    AdminStatsController,
    AdminSystemController,
    CareersController,
    AdminCareersCatalogController,
    ProfileGatewayController,
    CalibrationGatewayController,
    SimulatorGatewayController,
    CalibrationDecksController,
    AdminCalibrationDecksController,
    MotorGatewayController,
    SupportGatewayController,
    AdminSupportGatewayController,
    NotificationsGatewayController,
    AdminNotificationsGatewayController,
  ],
  providers: [
    ApiGatewayService,
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
    RolesGuard,
  ],
})
export class ApiGatewayModule {}
