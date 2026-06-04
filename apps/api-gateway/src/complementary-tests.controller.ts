import {
  Controller,
  Get,
  Post,
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
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { lastValueFrom } from 'rxjs';

@ApiTags('Complementary Tests')
@ApiBearerAuth()
@Controller('tests')
export class ComplementaryTestsController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Get(':testId')
  async getComplementaryTest(@Param('testId') testId: string) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.get-complementary-test' },
        { testId },
      ),
    );
  }

  @ApiOperation({ summary: 'Submit answers for a complementary test' })
  @ApiResponse({ status: 201, description: 'Test submitted successfully' })
  @ApiBody({
    schema: {
      example: {
        answers: {
          q1: 'Option A',
          q2: 'Option B'
        }
      }
    }
  })
  @Post(':testId/submit')
  @UseGuards(JwtAuthGuard)
  async submitComplementaryTest(
    @Param('testId') testId: string,
    @Body() data: any,
    @Request() req: any,
  ) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.submit-complementary-test' },
        {
          userId: req.user.userId,
          testId,
          answers: data.answers,
        },
      ),
    );
  }

  @ApiOperation({ summary: 'Submit answers for a calibration module' })
  @ApiResponse({
    status: 201,
    description: 'Calibration submitted successfully',
  })
  @ApiBody({
    schema: {
      example: {
        moduleId: 'math-calibration-1',
        answers: {
          q1: 'Option A',
          q2: 'Option C'
        }
      }
    }
  })
  @Post('calibration')
  @UseGuards(JwtAuthGuard)
  async submitCalibration(@Body() data: any, @Request() req: any) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.submit-calibration' },
        {
          userId: req.user.userId,
          moduleId: data.moduleId,
          answers: data.answers,
        },
      ),
    );
  }

  @ApiOperation({ summary: 'Get calibration answers for a user (Admin)' })
  @ApiResponse({ status: 200, description: 'Returns calibration answers' })
  @Get('calibration/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getCalibration(@Param('userId') userId: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.get-calibration' }, { userId }),
    );
  }

  @ApiOperation({ summary: 'Get calibration answers for the logged-in user' })
  @ApiResponse({ status: 200, description: 'Returns calibration answers' })
  @Get('calibration/me')
  @UseGuards(JwtAuthGuard)
  async getMyCalibration(@Request() req: any) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.get-calibration' },
        { userId: req.user.userId },
      ),
    );
  }
}

@ApiTags('Admin Complementary Tests')
@ApiBearerAuth()
@Controller('admin/tests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminComplementaryTestsController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @ApiOperation({ summary: 'Create a new complementary test (Admin only)' })
  @ApiResponse({ status: 201, description: 'Test created successfully' })
  @ApiBody({
    schema: {
      example: {
        name: 'Mathematical Aptitude Test',
        description: 'Assesses basic to advanced mathematical skills.',
        type: 'aptitude',
        questions: [
          {
            id: 'q1',
            text: 'What is 2 + 2?',
            options: ['3', '4', '5'],
            correctAnswer: '4'
          }
        ]
      }
    }
  })
  @Post()
  async createComplementaryTest(@Body() data: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.create-complementary-test' }, data),
    );
  }
}
