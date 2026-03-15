import { NestFactory } from '@nestjs/core';
import { AiModule } from './ai.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AiModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT_AI', 3004);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: port,
    },
  });

  await app.startAllMicroservices();
  console.log(`AI Microservice is listening on TCP port ${port}`);
}
bootstrap();
