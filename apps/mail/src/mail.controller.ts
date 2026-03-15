import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { MailService } from './mail.service';

@Controller()
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @EventPattern('mail.send-otp')
  async handleSendOtp(@Payload() data: { email: string, code: string, purpose: string }) {
    await this.mailService.sendOtpEmail(data.email, data.code, data.purpose);
  }
}
