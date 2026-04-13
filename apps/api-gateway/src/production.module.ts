import { Module } from '@nestjs/common';
import { ApiGatewayModule } from './api-gateway.module';
import { AuthModule } from '../../auth/src/auth.module';
import { UsersModule } from '../../users/src/users.module';
import { MailModule } from '../../mail/src/mail.module';
import { TestsModule } from '../../tests/src/tests.module';
import { AiModule } from '../../ai/src/ai.module';

@Module({
  imports: [
    ApiGatewayModule,
    AuthModule,
    UsersModule,
    MailModule,
    TestsModule,
    AiModule,
  ],
})
export class ProductionModule {}
