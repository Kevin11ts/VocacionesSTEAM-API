import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private apiInstance: BrevoClient;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');

    if (!apiKey) {
      this.logger.error('CRITICAL: BREVO_API_KEY is not defined in environment variables');
      return;
    }

    this.apiInstance = new BrevoClient({ apiKey });
  }

  async sendOtpEmail(email: string, code: string, purpose: string) {
    if (!this.apiInstance) {
      this.logger.error('Cannot send email: Brevo API instance not initialized (missing API Key)');
      return;
    }

    const subject = purpose === 'register' ? 'Verifica tu cuenta en STEAM Vocations' : 'Recupera tu contraseña';
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4A90E2; border-bottom: 2px solid #4A90E2; padding-bottom: 10px;">STEAM Vocations</h2>
        <p style="font-size: 16px;">Hola,</p>
        <p style="font-size: 16px;">Recibimos una solicitud para ${purpose === 'register' ? 'crear una cuenta' : 'restablecer tu contraseña'}.</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #666;">Tu código de verificación es:</p>
          <strong style="font-size: 32px; color: #4A90E2; letter-spacing: 5px;">${code}</strong>
        </div>
        <p style="font-size: 14px; color: #888;">Este código expira en 15 minutos.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #aaa; text-align: center;">Si no solicitaste este correo, puedes ignorarlo con seguridad.</p>
      </div>
    `;

    try {
      this.logger.log(`Enviando correo real vía Brevo API a: ${email}`);
      const data = await this.apiInstance.transactionalEmails.sendTransacEmail({
        subject,
        htmlContent,
        sender: { name: 'STEAM Vocations', email: 'vocaciones.steam0@gmail.com' },
        to: [{ email }],
      });
      this.logger.log('Correo enviado satisfactoriamente: ' + JSON.stringify(data));
    } catch (error) {
      this.logger.error(`Falló el envío de correo a ${email}`, error);
      if (error.body) {
        this.logger.error('Brevo Error Detail:', JSON.stringify(error.body));
      }
    }
  }
}
