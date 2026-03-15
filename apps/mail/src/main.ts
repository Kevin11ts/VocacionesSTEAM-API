import { NestFactory } from '@nestjs/core';
import { MailModule } from './mail.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(MailModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT_MAIL', 3005);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: port,
    },
  });

  await app.startAllMicroservices();
  console.log(`Mail Microservice is listening on TCP port ${port}`);
}
bootstrap();
