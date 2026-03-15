import { Test, TestingModule } from '@nestjs/testing';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

describe('TestsController', () => {
  let testsController: TestsController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [TestsController],
      providers: [TestsService],
    }).compile();

    testsController = app.get<TestsController>(TestsController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(testsController.getHello()).toBe('Hello World!');
    });
  });
});
