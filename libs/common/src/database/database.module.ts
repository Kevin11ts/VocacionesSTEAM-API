import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        if (databaseUrl) {
          // Railway PostgreSQL provee DATABASE_URL directamente
          return {
            type: 'postgres',
            url: databaseUrl,
            autoLoadEntities: true,
            // En producción el esquema nunca debe mutar al arrancar. Para un
            // entorno temporal se puede habilitar de forma explícita.
            synchronize:
              configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
            ssl: { rejectUnauthorized: false }, // Requerido por Railway
          };
        }
        // Fallback para desarrollo local
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          username: configService.get<string>('DB_USER', 'postgres'),
          password: configService.get<string>('DB_PASSWORD', 'postgres'),
          database: configService.get<string>('DB_NAME', 'steam_vocations'),
          autoLoadEntities: true,
          synchronize:
            configService.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
