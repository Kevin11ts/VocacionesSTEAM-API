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
import { CurrentUser } from './decorators/current-user.decorator';
import { lastValueFrom } from 'rxjs';
import { MatchUniversitiesDto } from '@app/common';

@ApiTags('Universities')
@Controller('universities')
export class UniversitiesController {
  constructor(@Inject('AI_SERVICE') private readonly aiClient: ClientProxy) {}

  @ApiOperation({ summary: 'Get all universities' })
  @ApiResponse({ status: 200, description: 'List of universities' })
  @Get()
  async getUniversities() {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.get-universities' }, {}),
    );
  }

  @ApiOperation({
    summary:
      'A8: matching de universidades (datos duros + IA, filtros sobre caché)',
  })
  @ApiResponse({
    status: 201,
    description: '{ matches: [...], generatedAt } rankeado por matchScore',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiBody({ type: MatchUniversitiesDto })
  @Post('match')
  async matchUniversities(
    @CurrentUser() user: any,
    @Body() body: MatchUniversitiesDto,
  ) {
    return lastValueFrom(
      this.aiClient.send(
        { cmd: 'ai.match-universities' },
        { userId: user.id, request: body },
      ),
    );
  }
}

@ApiTags('Admin Universities')
@ApiBearerAuth()
@Controller('admin/universities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUniversitiesController {
  constructor(@Inject('AI_SERVICE') private readonly aiClient: ClientProxy) {}

  @ApiOperation({ summary: 'Create a new university (Admin only)' })
  @ApiResponse({ status: 201, description: 'University created successfully' })
  @ApiBody({
    schema: {
      example: {
        name: 'Universidad Nacional Autónoma de México',
        acronym: 'UNAM',
        type: 'Public',
        website: 'https://www.unam.mx',
        logoUrl: 'https://example.com/logo.png',
        location: { city: 'Mexico City', state: 'CDMX', country: 'Mexico' },
        description: 'La máxima casa de estudios de México.',
        steamCareers: ['Ingeniería en Computación', 'Física', 'Matemáticas'],
        tags: ['public', 'research', 'prestigious']
      }
    }
  })
  @Post()
  async createUniversity(@Body() data: any) {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.create-university' }, data),
    );
  }

  @ApiOperation({ summary: 'Update a university (Admin only)' })
  @ApiResponse({ status: 200, description: 'University updated successfully' })
  @ApiBody({
    schema: {
      example: {
        description: 'Updated description for this university.',
        steamCareers: ['Ingeniería en Computación', 'Física', 'Matemáticas', 'Biología']
      }
    }
  })
  @Put(':id')
  async updateUniversity(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.update-university' }, { id, data }),
    );
  }

  @Delete(':id')
  async deleteUniversity(@Param('id') id: string) {
    return lastValueFrom(
      this.aiClient.send({ cmd: 'ai.delete-university' }, { id }),
    );
  }
}
