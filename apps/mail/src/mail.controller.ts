import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MailService } from './mail.service';

@Controller()
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @MessagePattern({ cmd: 'mail.send-otp' })
  async handleSendOtp(
    @Payload() data: { email: string; code: string; purpose: string },
  ) {
    return this.mailService.sendOtpEmail(data.email, data.code, data.purpose);
  }
}
