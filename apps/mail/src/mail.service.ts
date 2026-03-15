import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
  }

  async sendOtpEmail(email: string, code: string, purpose: string) {
    const subject = purpose === 'register' ? 'Verifica tu cuenta en STEAM Vocations' : 'Recupera tu contraseña';
    
    const html = `
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
      this.logger.log(`Enviando correal real via Resend a: ${email}`);
      
      const { data, error } = await this.resend.emails.send({
        from: 'STEAM Vocations <onboarding@resend.dev>', // Usando el dominio de prueba de Resend por defecto
        to: [email],
        subject,
        html,
      });

      if (error) {
        this.logger.error('Error de Resend:', error);
      } else {
        this.logger.log('Correo enviado satisfactoriamente:', data.id);
      }
    } catch (error) {
      this.logger.error(`Falló el envío de correo a ${email}`, error);
    }
  }
}
