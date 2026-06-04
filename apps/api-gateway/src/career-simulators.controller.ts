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
  ApiBody,
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

  @ApiOperation({ summary: 'Get all career simulators (Public)' })
  @ApiResponse({ status: 200, description: 'Returns list of simulators' })
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
  @ApiBody({
    schema: {
      example: {
        slug: 'software-engineering-simulator',
        careerName: 'Software Engineering',
        steamArea: 'Technology',
        estimatedDurationMinutes: 15,
        difficulty: 'Medium',
        status: 'activo',
        colorToken: 'primary',
        icon: 'code',
        shortDescription: 'Experience a day in the life of a software engineer.',
        tags: ['coding', 'problem-solving', 'technology'],
        steps: [
          {
            id: 'step_1',
            type: 'decision',
            question: 'What language will you use?',
            options: [
              { id: 'opt_1', text: 'Python', nextStepId: 'step_2' },
              { id: 'opt_2', text: 'JavaScript', nextStepId: 'step_2' }
            ]
          }
        ],
        completionConfig: {
          badge: 'Junior Developer',
          score: 100
        }
      }
    }
  })
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
  @ApiBody({
    schema: {
      example: {
        careerName: 'Software Engineering Updated',
        estimatedDurationMinutes: 20,
        status: 'inactivo'
      }
    }
  })
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
