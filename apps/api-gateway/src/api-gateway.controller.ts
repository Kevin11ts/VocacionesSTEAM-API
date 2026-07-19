import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiGatewayService } from './api-gateway.service';

@ApiTags('system')
@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @Get('health')
  @ApiOperation({ summary: 'Comprobar que el gateway HTTP está disponible' })
  getHealth() {
    return this.apiGatewayService.getHealth();
  }
}
