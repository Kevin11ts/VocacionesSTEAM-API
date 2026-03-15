import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthGatewayController } from './auth.controller';
import { UsersGatewayController } from './users.controller';
import { TestsGatewayController } from './tests.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
    ClientsModule.registerAsync([
      {
        name: 'AUTH_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: { host: '127.0.0.1', port: config.get<number>('PORT_AUTH', 3001) },
        }),
      },
      {
        name: 'USERS_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: { host: '127.0.0.1', port: config.get<number>('PORT_USERS', 3002) },
        }),
      },
      {
        name: 'TESTS_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: { host: '127.0.0.1', port: config.get<number>('PORT_TESTS', 3003) },
        }),
      },
    ]),
  ],
  controllers: [AuthGatewayController, UsersGatewayController, TestsGatewayController],
  providers: [JwtStrategy, GoogleStrategy],
})
export class ApiGatewayModule {}
