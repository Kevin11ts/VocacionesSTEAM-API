import { Controller, Delete, Get, UseGuards, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { lastValueFrom } from 'rxjs';

@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminStatsController {
  constructor(
    @Inject('USERS_SERVICE') private readonly usersClient: ClientProxy,
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Get()
  async getStats() {
    // El microservicio de tests tiene acceso a usuarios, tests, simuladores
    // y preguntas: agrega ahí todas las métricas reales del dashboard.
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.admin-stats' }, {}),
    );
  }
}

@Controller('admin/system')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminSystemController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Get('overview')
  async getOverview() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.admin-system-overview' }, {}),
    );
  }

  @Delete('cache')
  async clearCache() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.admin-clear-cache' }, {}),
    );
  }

  @Delete('orphan-options')
  async cleanupOrphanOptions() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.admin-cleanup-orphan-options' }, {}),
    );
  }
}
