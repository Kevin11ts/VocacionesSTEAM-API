import { Controller, Post, Get, Body, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { lastValueFrom } from 'rxjs';

class SubmitTestDto {
  @ApiProperty({ example: { '1': 'A', '2': 'C' } })
  answers: Record<string, string>;

  @ApiProperty({ example: 'Veracruz, México', required: false })
  locationInput?: string;
}

@ApiTags('tests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsGatewayController {
  constructor(@Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy) {}

  @Get('questions')
  @ApiOperation({ summary: 'Get all test questions' })
  @ApiResponse({ status: 200, description: 'List of questions and their options' })
  async getQuestions() {
    return lastValueFrom(this.testsClient.send({ cmd: 'tests.get-questions' }, {}));
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit vocational test answers' })
  @ApiResponse({ status: 201, description: 'Test processed, recommendations generated' })
  @ApiBody({ type: SubmitTestDto })
  async submitTest(@CurrentUser() user: any, @Body() body: SubmitTestDto) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.submit' }, { 
        userId: user.id, 
        answers: body.answers, 
        locationInput: body.locationInput 
      })
    );
  }
}
