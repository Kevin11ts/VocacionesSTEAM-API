import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MailService } from './mail.service';
import { NotificationService } from './notification.service';
import { SendNotificationCampaignDto } from '@app/common';

@Controller()
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
  ) {}

  @MessagePattern({ cmd: 'mail.send-otp' })
  async handleSendOtp(
    @Payload() data: { email: string; code: string; purpose: string },
  ) {
    return this.mailService.sendOtpEmail(data.email, data.code, data.purpose);
  }

  @MessagePattern({ cmd: 'mail.support-created' })
  async supportCreated(@Payload() data: any) {
    return this.mailService.sendSupportCreated(data);
  }

  @MessagePattern({ cmd: 'mail.support-reply' })
  async supportReply(@Payload() data: any) {
    return this.mailService.sendSupportReply(data);
  }

  @MessagePattern({ cmd: 'notifications.public-key' })
  async publicKey() {
    return this.notificationService.getPublicKey();
  }

  @MessagePattern({ cmd: 'notifications.subscribe' })
  async subscribe(@Payload() payload: { userId: string; data: any }) {
    return this.notificationService.subscribe(payload.userId, payload.data);
  }

  @MessagePattern({ cmd: 'notifications.unsubscribe' })
  async unsubscribe(@Payload() userId: string) {
    return this.notificationService.unsubscribe(userId);
  }

  @MessagePattern({ cmd: 'notifications.test' })
  async test(@Payload() userId: string) {
    return this.notificationService.sendTest(userId);
  }

  @MessagePattern({ cmd: 'notifications.send-campaign' })
  async sendCampaign(
    @Payload()
    payload: {
      data: SendNotificationCampaignDto;
      sentBy?: string;
    },
  ) {
    return this.notificationService.sendCampaign(payload.data, payload.sentBy);
  }

  @MessagePattern({ cmd: 'notifications.list-campaigns' })
  async listCampaigns() {
    return this.notificationService.listCampaigns();
  }

  @MessagePattern({ cmd: 'notifications.list-deliveries' })
  async listDeliveries() {
    return this.notificationService.listDeliveries();
  }
}
