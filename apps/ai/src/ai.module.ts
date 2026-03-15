import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CommonModule } from '@app/common';

@Module({
  imports: [CommonModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
