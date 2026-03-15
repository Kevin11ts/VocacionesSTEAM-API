import { NestFactory } from '@nestjs/core';
import { TestsModule } from './tests.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(TestsModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT_TESTS', 3003);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: port,
    },
  });

  await app.startAllMicroservices();
  console.log(`Tests Microservice is listening on TCP port ${port}`);
}
bootstrap();
