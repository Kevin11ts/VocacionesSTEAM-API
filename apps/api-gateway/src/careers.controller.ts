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
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { lastValueFrom } from 'rxjs';

/**
 * Catálogos de vocaciones (A6) y carreras (A7) agrupados por eje STEAM.
 * La afinidad NO vive en el catálogo: la calcula el motor en runtime.
 */
@ApiTags('Careers Catalog')
@Controller('careers')
export class CareersController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @ApiOperation({ summary: 'Get vocation/career catalogs and axis metadata (Public)' })
  @ApiResponse({
    status: 200,
    description: 'Returns { vocations, careers, axisMeta }',
  })
  @Get('catalog')
  async getCatalogs() {
    return lastValueFrom(this.testsClient.send({ cmd: 'tests.get-catalogs' }, {}));
  }
}

@ApiTags('Admin Careers Catalog')
@ApiBearerAuth()
@Controller('admin/careers-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCareersCatalogController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  // --- Vocaciones (A6) ---

  @ApiOperation({ summary: 'Create a vocation catalog entry (Admin only)' })
  @ApiBody({
    schema: {
      example: {
        axis: 'tecnologia',
        name: 'Desarrollo de software',
        description: 'Diseñar y construir aplicaciones y sistemas.',
        skills: ['Programación', 'Lógica'],
        icon: 'code-2',
      },
    },
  })
  @Post('vocations')
  async createVocation(@Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.create-vocation' }, data),
    );
  }

  @ApiOperation({ summary: 'Update a vocation catalog entry (Admin only)' })
  @ApiParam({ name: 'id', description: 'Vocation UUID' })
  @Put('vocations/:id')
  async updateVocation(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.update-vocation' }, { id, data }),
    );
  }

  @ApiOperation({ summary: 'Delete a vocation catalog entry (Admin only)' })
  @ApiParam({ name: 'id', description: 'Vocation UUID' })
  @Delete('vocations/:id')
  async deleteVocation(@Param('id') id: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.delete-vocation' }, { id }),
    );
  }

  // --- Carreras (A7) ---

  @ApiOperation({ summary: 'Create a career catalog entry (Admin only)' })
  @ApiBody({
    schema: {
      example: {
        axis: 'tecnologia',
        careerName: 'Ingeniería en Software',
        studyPlanHighlights: ['Algoritmos', 'Bases de datos'],
        careerFields: ['Startups', 'Cloud'],
        relatedSimulatorSlug: 'software',
        icon: 'code-2',
      },
    },
  })
  @Post('careers')
  async createCareer(@Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.create-career-item' }, data),
    );
  }

  @ApiOperation({ summary: 'Update a career catalog entry (Admin only)' })
  @ApiParam({ name: 'id', description: 'Career UUID' })
  @Put('careers/:id')
  async updateCareer(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.update-career-item' }, { id, data }),
    );
  }

  @ApiOperation({ summary: 'Delete a career catalog entry (Admin only)' })
  @ApiParam({ name: 'id', description: 'Career UUID' })
  @Delete('careers/:id')
  async deleteCareer(@Param('id') id: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.delete-career-item' }, { id }),
    );
  }

  // --- Metadatos narrativos por eje ---

  @ApiOperation({ summary: 'Update narrative metadata for a STEAM axis (Admin only)' })
  @ApiParam({ name: 'axis', description: 'ciencia | tecnologia | ingenieria | artes | matematicas' })
  @ApiBody({
    schema: {
      example: {
        label: 'Tecnología',
        adjective: 'Tecnológico',
        archetype: 'Creador Digital',
        strengthTitle: 'Mentalidad tecnológica',
        strengthDesc: 'Aprendes herramientas nuevas con facilidad...',
        workStyle: ['Aprendizaje autodidacta', 'Lógica computacional'],
        icon: 'cpu',
      },
    },
  })
  @Put('axis-meta/:axis')
  async updateAxisMeta(@Param('axis') axis: string, @Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.update-axis-meta' }, { axis, data }),
    );
  }
}
