import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { lastValueFrom } from 'rxjs';

/** Lectura pública de los decks de calibración (app del estudiante). */
@ApiTags('Calibration Decks')
@Controller('calibration-decks')
export class CalibrationDecksController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Módulos de calibración activos (público)' })
  async getActive() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'calibration.decks-active' }, {}),
    );
  }

  @Get(':moduleId')
  @ApiOperation({ summary: 'Un módulo de calibración por moduleId (público)' })
  @ApiParam({ name: 'moduleId' })
  async getOne(@Param('moduleId') moduleId: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'calibration.deck-by-module' }, { moduleId }),
    );
  }
}

/** CRUD de decks de calibración (solo admin). */
@ApiTags('Admin Calibration Decks')
@ApiBearerAuth()
@Controller('admin/calibration-decks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCalibrationDecksController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Todos los módulos, incluidos inactivos (Admin)' })
  async getAll() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'calibration.decks-all' }, {}),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Crear un módulo de calibración (Admin)' })
  async create(@Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'calibration.deck-create' }, data),
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un módulo de calibración (Admin)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'calibration.deck-update' }, { id, data }),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un módulo de calibración (Admin)' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'calibration.deck-delete' }, { id }),
    );
  }
}
