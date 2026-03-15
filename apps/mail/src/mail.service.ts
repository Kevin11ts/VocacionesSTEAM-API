import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    // En un escenario real, usa variables SMTP reales de ConfigService
    this.transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'mock_user@ethereal.email',
        pass: 'mock_password',
      },
    });
  }

  async sendOtpEmail(email: string, code: string, purpose: string) {
    const subject = purpose === 'register' ? 'Verifica tu cuenta en STEAM Vocations' : 'Recupera tu contraseña';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #4A90E2;">STEAM Vocations</h2>
        <p>Hola,</p>
        <p>Tu código de verificación es: <strong style="font-size: 24px;">${code}</strong></p>
        <p>Este código expira en 15 minutos.</p>
        <p>Si no solicitaste esto, ignora este correo.</p>
      </div>
    `;

    try {
      this.logger.log(`[MOCK EMAIL SEND] Enviando OTP ${code} a ${email}`);
      /*
      await this.transporter.sendMail({
        from: '"STEAM Vocations" <no-reply@steamvocations.app>',
        to: email,
        subject,
        html,
      });
      */
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}`, error);
    }
  }
}
