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
  Request,
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

@ApiTags('Simulators')
@Controller('simulators')
export class SimulatorsController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Get()
  async getSimulators() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.get-simulators' }, {}),
    );
  }

  @Get(':id')
  async getSimulatorById(@Param('id') id: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.get-simulator-by-id' }, { id }),
    );
  }

  @ApiOperation({ summary: 'Submit simulator answers and get static feedback' })
  @ApiResponse({ status: 201, description: 'Simulator evaluated successfully' })
  @ApiBearerAuth()
  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  async submitSimulator(
    @Param('id') simulatorId: string,
    @Body() data: any,
    @Request() req: any,
  ) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.evaluate-simulator' },
        {
          userId: req.user.userId,
          simulatorId,
          decisions: data.decisions,
        },
      ),
    );
  }
}

@ApiTags('Admin Simulators')
@ApiBearerAuth()
@Controller('admin/simulators')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminSimulatorsController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @ApiOperation({ summary: 'Get all simulators for admin' })
  @ApiResponse({ status: 200, description: 'Returns list of simulators' })
  @Get()
  async getAdminSimulators() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.get-simulators' }, {}),
    );
  }

  @ApiOperation({ summary: 'Create a new simulator with exactly 6 steps' })
  @ApiResponse({ status: 201, description: 'Simulator created successfully' })
  @Post()
  async createSimulator(@Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.create-simulator' }, data),
    );
  }

  @ApiOperation({ summary: 'Update an existing simulator' })
  @ApiResponse({ status: 200, description: 'Simulator updated successfully' })
  @Put(':id')
  async updateSimulator(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.update-simulator' }, { id, data }),
    );
  }

  @ApiOperation({ summary: 'Delete a simulator' })
  @ApiResponse({ status: 200, description: 'Simulator deleted successfully' })
  @Delete(':id')
  async deleteSimulator(@Param('id') id: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.delete-simulator' }, { id }),
    );
  }
}
