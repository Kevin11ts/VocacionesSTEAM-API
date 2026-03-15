import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.CORS_ORIGIN || '*' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('STEAM Vocations API')
    .setDescription('El Gateway API Blueprint Maestro para la PWA de Vocaciones STEAM')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // Swagger UI está en /api

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT_GATEWAY', 3000);

  await app.listen(port);
  console.log(`API Gateway ejecutándose en: http://localhost:${port}/api/v1`);
  console.log(`Documentación de Swagger disponible en: http://localhost:${port}/api`);
}
bootstrap();
