import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { lastValueFrom } from 'rxjs';

@ApiTags('Career Simulators')
@Controller('career-simulators')
export class CareerSimulatorsController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @ApiOperation({ summary: 'Get simulator by slug (publicly cacheable)' })
  @ApiResponse({ status: 200, description: 'Returns the simulator data without AI evaluation logic' })
  @Get(':slug')
  async getSimulatorBySlug(@Param('slug') slug: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.get-simulator-by-slug' }, { slug }),
    );
  }

  @ApiOperation({ summary: 'Get all career simulators (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns list of simulators' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get()
  async getSimulators() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.get-simulators' }, {}),
    );
  }

  @ApiOperation({ summary: 'Create a new career simulator (Admin only)' })
  @ApiResponse({ status: 201, description: 'Simulator created successfully' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  async createSimulator(@Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.create-simulator' }, data),
    );
  }

  @ApiOperation({ summary: 'Update an existing career simulator (Admin only)' })
  @ApiResponse({ status: 200, description: 'Simulator updated successfully' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put(':id')
  async updateSimulator(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.update-simulator' }, { id, data }),
    );
  }

  @ApiOperation({ summary: 'Delete a career simulator (Admin only)' })
  @ApiResponse({ status: 200, description: 'Simulator deleted successfully' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  async deleteSimulator(@Param('id') id: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.delete-simulator' }, { id }),
    );
  }
}
