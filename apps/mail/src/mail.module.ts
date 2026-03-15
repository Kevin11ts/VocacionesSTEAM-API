import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { CommonModule } from '@app/common';

@Module({
  imports: [CommonModule],
  controllers: [MailController],
  providers: [MailService],
})
export class MailModule {}
