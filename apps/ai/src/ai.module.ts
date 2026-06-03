import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule, AiLog, University } from '@app/common';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([AiLog, University])],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
