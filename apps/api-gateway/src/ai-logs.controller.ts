import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Admin / AI Logs')
@Controller('admin/ai-logs')
export class AiLogsGatewayController {
  constructor(@Inject('AI_SERVICE') private readonly aiClient: ClientProxy) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin') // Assumes admin role exists based on user.entity.ts
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener métricas de uso de IA' })
  @ApiResponse({
    status: 200,
    description: 'Retorna las estadísticas y logs de IA recientes.',
  })
  async getAiLogsStats() {
    return this.aiClient.send({ cmd: 'ai.get-logs-stats' }, {});
  }
}
