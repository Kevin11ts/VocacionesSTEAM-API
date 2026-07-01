import { Controller, Post, Body, Inject, UseGuards } from '@nestjs/common';
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
import { ComputeProfileDto } from '@app/common';

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
    description: 'VocationalProfile completo con contributions y profileVersion',
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
