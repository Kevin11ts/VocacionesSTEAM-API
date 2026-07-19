import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { CommonModule } from '@app/common';
import {
  NotificationCampaign,
  NotificationConfig,
  NotificationDelivery,
  PushSubscriptionEntity,
  User,
  VocationalTest,
} from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    CommonModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      User,
      VocationalTest,
      PushSubscriptionEntity,
      NotificationConfig,
      NotificationDelivery,
      NotificationCampaign,
    ]),
  ],
  controllers: [MailController],
  providers: [MailService, NotificationService],
})
export class MailModule {}
