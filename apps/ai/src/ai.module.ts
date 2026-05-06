import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule, AiLog } from '@app/common';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([AiLog])],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
