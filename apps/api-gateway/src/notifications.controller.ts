import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { lastValueFrom } from 'rxjs';
import {
  RegisterPushSubscriptionDto,
  SendNotificationCampaignDto,
} from '@app/common';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsGatewayController {
  constructor(
    @Inject('MAIL_SERVICE') private readonly mailClient: ClientProxy,
  ) {}

  @Get('vapid-public-key')
  @ApiOperation({
    summary: 'Clave pública para crear una suscripción Web Push',
  })
  async publicKey() {
    return lastValueFrom(
      this.mailClient.send({ cmd: 'notifications.public-key' }, {}),
    );
  }

  @Post('push/subscriptions')
  @ApiBody({ type: RegisterPushSubscriptionDto })
  async subscribe(
    @CurrentUser() user: any,
    @Body() data: RegisterPushSubscriptionDto,
  ) {
    return lastValueFrom(
      this.mailClient.send(
        { cmd: 'notifications.subscribe' },
        { userId: user.id, data },
      ),
    );
  }

  @Delete('push/subscriptions')
  async unsubscribe(@CurrentUser() user: any) {
    return lastValueFrom(
      this.mailClient.send({ cmd: 'notifications.unsubscribe' }, user.id),
    );
  }

  @Post('test')
  async test(@CurrentUser() user: any) {
    return lastValueFrom(
      this.mailClient.send({ cmd: 'notifications.test' }, user.id),
    );
  }
}

@ApiTags('admin-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/notifications')
export class AdminNotificationsGatewayController {
  constructor(
    @Inject('MAIL_SERVICE') private readonly mailClient: ClientProxy,
  ) {}

  @Post('campaigns')
  @ApiBody({ type: SendNotificationCampaignDto })
  async sendCampaign(
    @CurrentUser() user: any,
    @Body() data: SendNotificationCampaignDto,
  ) {
    return lastValueFrom(
      this.mailClient.send(
        { cmd: 'notifications.send-campaign' },
        { data, sentBy: user.id },
      ),
    );
  }

  @Get('campaigns')
  async campaigns() {
    return lastValueFrom(
      this.mailClient.send({ cmd: 'notifications.list-campaigns' }, {}),
    );
  }

  @Get('deliveries')
  async deliveries() {
    return lastValueFrom(
      this.mailClient.send({ cmd: 'notifications.list-deliveries' }, {}),
    );
  }
}
