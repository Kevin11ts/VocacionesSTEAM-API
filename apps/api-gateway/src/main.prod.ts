import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ProductionModule } from './production.module';
import { AuthModule } from '../../auth/src/auth.module';
import { UsersModule } from '../../users/src/users.module';
import { MailModule } from '../../mail/src/mail.module';
import { TestsModule } from '../../tests/src/tests.module';
import { AiModule } from '../../ai/src/ai.module';
import { RpcToHttpExceptionFilter } from './filters/rpc-exception.filter';

async function bootstrap() {
  const logger = new Logger('ProductionMonolith');

  // 1. Crear la Aplicación Principal "Todo-en-uno"
  // Usamos ProductionModule que ya importa y agrupa a todos los demás módulos
  const app = await NestFactory.create(ProductionModule);

  const configService = app.get(ConfigService);

  // Usamos 'PORT' como variable estándar de Railway
  const apiPort = configService.get<number>('PORT', 3000);

  // 2. Conectar los Microservicios en Memoria Localmente
  // Como todos los módulos están cargados en el 'app', los conectamos localmente por TCP
  const microservices = [
    { name: 'Auth', port: configService.get<number>('PORT_AUTH', 3001) },
    { name: 'Users', port: configService.get<number>('PORT_USERS', 3002) },
    { name: 'Tests', port: configService.get<number>('PORT_TESTS', 3003) },
    { name: 'AI', port: configService.get<number>('PORT_AI', 3004) },
    { name: 'Mail', port: configService.get<number>('PORT_MAIL', 3005) },
  ];

  for (const ms of microservices) {
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: {
        host: '127.0.0.1', // OBLIGA a comunicarse internamente (Sin consumir red de Railway)
        port: ms.port,
      },
    });
    logger.log(
      `Microservicio ${ms.name} conectado internamente en el puerto ${ms.port}`,
    );
  }

  // 3. Configuración Global (Copia de tu main.ts del API Gateway)
  app.setGlobalPrefix('api/v1');
  const corsOrigins = (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  });

  app.useGlobalFilters(new RpcToHttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 4. Configurar Swagger
  const config = new DocumentBuilder()
    .setTitle('STEAM Vocations API (Monolito Prod)')
    .setDescription(
      'Versión Unificada y Óptima para Producción de todos los microservicios',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // 5. Iniciar Microservicios y API HTTP
  await app.startAllMicroservices();
  await app.listen(apiPort);

  logger.log(
    `🚀 Monolito de Producción ejecutándose en: http://localhost:${apiPort}/api/v1`,
  );
  logger.log(
    `📚 Documentación de Swagger disponible en: http://localhost:${apiPort}/api`,
  );
}

bootstrap();
