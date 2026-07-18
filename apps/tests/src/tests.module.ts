import { Module } from '@nestjs/common';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import { CatalogService } from './profile/catalog.service';
import { ProfileService } from './profile/profile.service';
import { CalibrationDeckService } from './calibration-deck.service';
import { MotorVocacionalService } from './motor/motor-vocacional.service';
import { SystemAdminService } from './system-admin.service';
import {
  AlgorithmRun,
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
  CareerSimulator,
  ComplementaryTest,
  UserHistory,
  CalibrationResult,
  CalibrationDeck,
  VocationCatalogItem,
  CareerCatalogItem,
  AxisMeta,
} from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';

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
      CareerSimulator,
      ComplementaryTest,
      UserHistory,
      CalibrationResult,
      CalibrationDeck,
      VocationCatalogItem,
      CareerCatalogItem,
      AxisMeta,
      AlgorithmRun,
    ]),
  ],
  controllers: [TestsController],
  providers: [
    TestsService,
    CatalogService,
    ProfileService,
    CalibrationDeckService,
    MotorVocacionalService,
    SystemAdminService,
  ],
})
export class TestsModule {}
