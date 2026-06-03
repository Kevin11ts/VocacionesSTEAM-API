import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
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
    // We could ask microservices for stats and aggregate them.
    // For simplicity, we assume usersClient can provide total users, 
    // and testsClient could provide simulations completed.
    // But since UserHistory is in testsClient, we should ask testsClient.
    
    // In a real scenario, we'd add methods to the microservices.
    // For now, let's just return a mock or call a new microservice method.
    // Since we didn't implement the aggregation in microservice yet, 
    // we'll return a stub to fulfill the API requirement structure.
    return {
      totalUsers: 0,
      totalSimulations: 0,
      mostPopularAffinity: 'Tecnología',
      message: 'Not fully implemented yet, requires microservices stats aggregation.'
    };
  }
}
