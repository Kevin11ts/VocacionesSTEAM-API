import { Module } from '@nestjs/common';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import {
  CommonModule,
  User,
  VocationalTest,
  AiRecommendation,
  Question,
  Option,
  UserSettings,
  OtpCode,
  SavedUniversity,
  SavedCourse,
  Simulator,
  SimulatorStep,
  SimulatorOption,
  ComplementaryTest,
  UserHistory,
  CalibrationResult,
} from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      User,
      VocationalTest,
      AiRecommendation,
      Question,
      Option,
      UserSettings,
      OtpCode,
      SavedUniversity,
      SavedCourse,
      Simulator,
      SimulatorStep,
      SimulatorOption,
      ComplementaryTest,
      UserHistory,
      CalibrationResult,
    ]),
    ClientsModule.registerAsync([
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
    ]),
  ],
  controllers: [TestsController],
  providers: [TestsService],
})
export class TestsModule {}
