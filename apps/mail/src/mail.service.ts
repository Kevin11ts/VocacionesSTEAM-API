import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private apiInstance?: BrevoClient;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');

    if (!apiKey) {
      this.logger.error(
        'CRITICAL: BREVO_API_KEY is not defined in environment variables',
      );
      return;
    }

    this.apiInstance = new BrevoClient({ apiKey });
  }

  async sendOtpEmail(email: string, code: string, purpose: string) {
    if (!this.apiInstance) {
      this.logger.error(
        'Cannot send email: Brevo API instance not initialized (missing API Key)',
      );
      throw new Error('El servicio de correo no está configurado');
    }

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://vocaciones-steam.vercel.app',
    );

    let subject = '';
    let title = '';
    let messageText = '';

    if (purpose === 'register') {
      subject = 'Verifica tu cuenta en STEAM Vocaciones';
      title = 'Tu código de acceso';
      messageText = 'crear una cuenta';
    } else if (purpose === 'login') {
      subject = 'Código para iniciar sesión en STEAM Vocaciones';
      title = 'Inicia sesión';
      messageText = 'iniciar sesión en tu cuenta';
    } else {
      subject = 'Recupera tu contraseña';
      title = 'Recupera tu contraseña';
      messageText = 'restablecer tu contraseña';
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de Verificación - Vocaciones STEAM</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F6F8; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F4F6F8; padding: 40px 20px;">
    <tr>
      <td align="center">
        
        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
          
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="height: 6px;">
                <tr>
                  <td width="25%" bgcolor="#07B1C9"></td> <td width="25%" bgcolor="#4DB046"></td> <td width="25%" bgcolor="#F88718"></td> <td width="25%" bgcolor="#E8372D"></td> 
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px 40px 30px 40px; text-align: center;">
              
              <a href="${frontendUrl}" target="_blank" style="text-decoration: none; outline: none; display: inline-block; margin-bottom: 25px;">
                <span style="font-size: 24px; font-weight: 800; color: #2C3E50; letter-spacing: 1px;">
                  <span style="color: #07B1C9">S</span><span style="color: #4DB046">T</span><span style="color: #F88718">E</span><span style="color: #E8372D">A</span><span style="color: #07B1C9">M</span>
                </span>
              </a>

              <h1 style="margin: 0 0 15px 0; font-size: 24px; color: #2C3E50; font-weight: 800;">
                ${title}
              </h1>
              <p style="margin: 0 0 30px 0; font-size: 16px; color: #4A5568; line-height: 1.6;">
                Hola,<br>Recibimos una solicitud para ${messageText}. Usa el siguiente código de un solo uso (OTP) para verificar tu identidad y acceder a tu cuenta.
              </p>

              <div style="background-color: #F0FBFC; border: 2px dashed #07B1C9; border-radius: 12px; padding: 25px 20px; margin-bottom: 25px;">
                <p style="margin: 0; font-size: 38px; font-weight: 800; color: #07B1C9; letter-spacing: 10px;"><strong>${code}</strong></p>
              </div>

              <p style="margin: 0 0 30px 0; font-size: 14px; color: #7F8C8D;">
                Este código es válido por 15 minutos.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top: 1px solid #EAEAEA; padding-top: 30px;"></td>
                </tr>
              </table>

              <p style="margin: 0 0 15px 0; font-size: 12px; color: #A0AEC0; line-height: 1.5; text-align: left;">
                <strong>Seguridad:</strong> No compartas este código con nadie. Si no solicitaste este acceso, puedes ignorar este correo de forma segura.
              </p>
              <p style="margin: 0; font-size: 12px; color: #A0AEC0; line-height: 1.5; text-align: left;">
                El equipo de <strong>Vocaciones STEAM</strong> nunca te contactará por otro medio para pedirte contraseñas o códigos de inicio de sesión. Ten cuidado con los intentos de phishing.
              </p>

            </td>
          </tr>
        </table>

        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9aa3af;">
                © 2026 Vocaciones STEAM. Todos los derechos reservados.<br>
                Córdoba, Veracruz, México.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
    `;

    try {
      this.logger.log(`Enviando correo real vía Brevo API a: ${email}`);
      const data = await this.apiInstance.transactionalEmails.sendTransacEmail({
        subject,
        htmlContent,
        sender: {
          name: 'Vocaciones STEAM',
          email: 'vocaciones.steam0@gmail.com',
        },
        to: [{ email }],
      });
      this.logger.log(
        'Correo enviado satisfactoriamente: ' + JSON.stringify(data),
      );
      return { delivered: true };
    } catch (error: any) {
      this.logger.error(`Falló el envío de correo a ${email}`, error);
      if (error.body) {
        this.logger.error('Brevo Error Detail:', JSON.stringify(error.body));
      }
      throw new Error('No se pudo entregar el correo con el código');
    }
  }
}
