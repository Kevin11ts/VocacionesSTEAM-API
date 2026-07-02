import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { UniversityMatchService } from './university-match.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CommonModule,
  AiLog,
  University,
  UniversityMatchCache,
  VocationalTest,
} from '@app/common';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      AiLog,
      University,
      UniversityMatchCache,
      VocationalTest,
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, UniversityMatchService],
})
export class AiModule {}
