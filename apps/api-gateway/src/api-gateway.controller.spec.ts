import { Test, TestingModule } from '@nestjs/testing';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';

describe('ApiGatewayController', () => {
  let apiGatewayController: ApiGatewayController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ApiGatewayController],
      providers: [ApiGatewayService],
    }).compile();

    apiGatewayController = app.get<ApiGatewayController>(ApiGatewayController);
  });

  describe('health', () => {
    it('reports the gateway as available', () => {
      const health = apiGatewayController.getHealth();

      expect(health.status).toBe('ok');
      expect(health.service).toBe('api-gateway');
      expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
    });
  });
});
