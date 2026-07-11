import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { lastValueFrom } from 'rxjs';
import { ComputeProfileDto } from '@app/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

/**
 * Puente hacia el Motor Vocacional API: el servicio externo (obra
 * independiente, FastAPI en Railway) que contiene los algoritmos A0-A8.
 * Cada corrida se persiste en Postgres (tabla algorithm_runs) con su
 * resultado, métricas y tiempo de ejecución, consultables desde aquí.
 */
@ApiTags('Motor Vocacional (A0-A8)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('motor')
export class MotorGatewayController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Post('profile/compute')
  @ApiOperation({
    summary:
      'Computa el perfil vocacional en el Motor Vocacional API remoto (A0: A1→A7) y persiste la corrida',
  })
  @ApiResponse({
    status: 201,
    description:
      '{ runId, algorithm, version, executionTimeMs, algorithmBreakdown, profile }',
  })
  @ApiBody({ type: ComputeProfileDto })
  async computeProfile(
    @CurrentUser() user: any,
    @Body() body: ComputeProfileDto,
  ) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.motor-compute-profile' },
        { userId: user.id, request: body },
      ),
    );
  }

  @Get('runs')
  @ApiOperation({
    summary:
      'Corridas del motor persistidas del usuario (resultado + métricas + tiempo de ejecución)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRuns(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.motor-get-runs' },
        { userId: user.id, limit: limit ? Number(limit) : undefined },
      ),
    );
  }

  @Get('metrics')
  @ApiOperation({
    summary:
      'Métricas de análisis agregadas por algoritmo (ejecuciones, avg/min/max ms, última corrida)',
  })
  async getMetrics() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.motor-get-metrics' }, {}),
    );
  }
}
