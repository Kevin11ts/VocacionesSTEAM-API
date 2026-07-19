import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { lastValueFrom } from 'rxjs';
import { CreateSupportTicketDto, UpdateSupportTicketDto } from '@app/common';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

const SUPPORT_FILE_LIMIT = 5 * 1024 * 1024;

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support/tickets')
export class SupportGatewayController {
  constructor(
    @Inject('USERS_SERVICE') private readonly usersClient: ClientProxy,
    @Inject('MAIL_SERVICE') private readonly mailClient: ClientProxy,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un ticket real de soporte con adjunto opcional',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['category', 'subject', 'message'],
      properties: {
        category: { type: 'string' },
        subject: { type: 'string' },
        message: { type: 'string' },
        attachment: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('attachment', {
      limits: { fileSize: SUPPORT_FILE_LIMIT, files: 1 },
      fileFilter: (_request, file, callback) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ].includes(file.mimetype);
        callback(
          allowed
            ? null
            : new BadRequestException('Tipo de archivo no permitido'),
          allowed,
        );
      },
    }),
  )
  async create(
    @CurrentUser() user: any,
    @Body() data: CreateSupportTicketDto,
    @UploadedFile() file?: any,
  ) {
    const result = await lastValueFrom(
      this.usersClient.send(
        { cmd: 'support.create' },
        {
          userId: user.id,
          data,
          attachment: file
            ? {
                name: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                dataBase64: file.buffer.toString('base64'),
              }
            : undefined,
        },
      ),
    );

    let emailDelivered = false;
    try {
      await lastValueFrom(
        this.mailClient.send(
          { cmd: 'mail.support-created' },
          {
            ticket: result.ticket,
            requester: result.requester,
          },
        ),
      );
      emailDelivered = true;
    } catch {
      // El ticket ya está persistido. La confirmación de correo se reporta sin
      // convertir una falla del proveedor en pérdida del caso de soporte.
    }
    return { ticket: result.ticket, emailDelivered };
  }

  @Get()
  async listOwn(@CurrentUser() user: any) {
    return lastValueFrom(
      this.usersClient.send({ cmd: 'support.list-own' }, user.id),
    );
  }

  @Get(':id/attachment')
  async attachment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await lastValueFrom(
      this.usersClient.send(
        { cmd: 'support.attachment' },
        { ticketId: id, requesterId: user.id, requesterRole: user.role },
      ),
    );
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    response.send(Buffer.from(file.dataBase64, 'base64'));
  }
}

@ApiTags('admin-support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/support/tickets')
export class AdminSupportGatewayController {
  constructor(
    @Inject('USERS_SERVICE') private readonly usersClient: ClientProxy,
    @Inject('MAIL_SERVICE') private readonly mailClient: ClientProxy,
  ) {}

  @Get()
  async list() {
    return lastValueFrom(
      this.usersClient.send({ cmd: 'support.list-all' }, {}),
    );
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: UpdateSupportTicketDto) {
    const result = await lastValueFrom(
      this.usersClient.send({ cmd: 'support.update' }, { ticketId: id, data }),
    );
    let emailDelivered = false;
    if (result.replyChanged) {
      try {
        await lastValueFrom(
          this.mailClient.send(
            { cmd: 'mail.support-reply' },
            {
              ticket: result.ticket,
              requester: result.requester,
            },
          ),
        );
        emailDelivered = true;
      } catch {
        // La respuesta permanece visible dentro de la app aunque falle Brevo.
      }
    }
    return { ticket: result.ticket, emailDelivered };
  }
}
