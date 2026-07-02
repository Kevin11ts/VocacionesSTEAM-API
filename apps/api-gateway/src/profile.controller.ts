import { Controller, Get, Post, Body, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { lastValueFrom } from 'rxjs';
import {
  ComputeProfileDto,
  SubmitCalibrationDto,
  SubmitSimulatorDto,
} from '@app/common';

/**
 * Motor de perfil vocacional STEAM (algoritmos deterministas A1-A7).
 * El contrato de salida es el VocationalProfile que ya consume la PWA.
 */
@ApiTags('Vocational Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileGatewayController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Post('compute')
  @ApiOperation({
    summary:
      'Computa el perfil vocacional (A1-A7, determinista) y lo guarda en el historial',
  })
  @ApiResponse({
    status: 201,
    description:
      'VocationalProfile completo con contributions y profileVersion',
  })
  @ApiBody({ type: ComputeProfileDto })
  async computeProfile(
    @CurrentUser() user: any,
    @Body() body: ComputeProfileDto,
  ) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.compute-profile' },
        { userId: user.id, request: body },
      ),
    );
  }
}

/** Módulos de calibración (swipe decks) que alimentan A2. */
@ApiTags('Vocational Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calibration')
export class CalibrationGatewayController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Post('submit')
  @ApiOperation({
    summary:
      'Guarda un módulo de calibración (upsert por módulo) y recomputa el perfil',
  })
  @ApiResponse({
    status: 201,
    description:
      '{ success, moduleId, profile } — profile es null si aún no hay test teórico',
  })
  @ApiBody({ type: SubmitCalibrationDto })
  async submitCalibration(
    @CurrentUser() user: any,
    @Body() body: SubmitCalibrationDto,
  ) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.submit-calibration-recompute' },
        { userId: user.id, moduleId: body.moduleId, answers: body.answers },
      ),
    );
  }
}

/** Resultados de simuladores de carrera que alimentan A3. */
@ApiTags('Vocational Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('simulator')
export class SimulatorGatewayController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Get('results')
  @ApiOperation({
    summary:
      'Resultados de simuladores del usuario (último intento por carrera)',
  })
  @ApiResponse({
    status: 200,
    description: '[{ careerSlug, axis, affinity, biasFlags, feedback, completedAt }]',
  })
  async getSimulatorResults(@CurrentUser() user: any) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.get-simulator-results' },
        { userId: user.id },
      ),
    );
  }

  @Post('submit')
  @ApiOperation({
    summary:
      'Corre A3a sobre las decisiones del simulador, guarda el resultado y recomputa el perfil',
  })
  @ApiResponse({
    status: 201,
    description: '{ success, affinity, feedback, profile }',
  })
  @ApiBody({ type: SubmitSimulatorDto })
  async submitSimulator(
    @CurrentUser() user: any,
    @Body() body: SubmitSimulatorDto,
  ) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.submit-simulator' },
        {
          userId: user.id,
          careerSlug: body.careerSlug,
          decisions: body.decisions,
          biasFlags: body.biasFlags,
        },
      ),
    );
  }
}
