import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import {
  CommonModule,
  User,
  UserSettings,
  VocationalTest,
  AiRecommendation,
  OtpCode,
  SavedUniversity,
  SavedCourse,
  SupportTicket,
  AlgorithmRun,
  UniversityMatchCache,
} from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      User,
      UserSettings,
      VocationalTest,
      AiRecommendation,
      OtpCode,
      SavedUniversity,
      SavedCourse,
      SupportTicket,
      AlgorithmRun,
      UniversityMatchCache,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
