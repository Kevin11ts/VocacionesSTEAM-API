import { Controller, Post, Get, Body, Inject, UseGuards, Put, Param, Delete, Patch } from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiProperty, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { lastValueFrom } from 'rxjs';
import { CreateQuestionDto, UpdateQuestionDto, CreateBulkQuestionsDto } from '@app/common';

class SubmitTestDto {
  @ApiProperty({ example: { '1': 'A', '2': 'C' } })
  @IsObject()
  answers: Record<string, string>;

  @ApiProperty({ example: 'Veracruz, México', required: false })
  @IsOptional()
  @IsString()
  locationInput?: string;
}

class UpdateTestNameDto {
  @ApiProperty({ example: 'Test Vocacional 2' })
  @IsString()
  testName: string;
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

  @Post('questions')
  @ApiOperation({ summary: 'Create a new test question' })
  @ApiResponse({ status: 201, description: 'Question created' })
  @ApiBody({ type: CreateQuestionDto })
  async createQuestion(@Body() data: CreateQuestionDto) {
    return lastValueFrom(this.testsClient.send({ cmd: 'tests.create-question' }, data));
  }

  @Post('questions/bulk')
  @ApiOperation({ summary: 'Create multiple questions at once' })
  @ApiResponse({ status: 201, description: 'Questions created successfully' })
  @ApiBody({ type: CreateBulkQuestionsDto })
  async createBulkQuestions(@Body() body: CreateBulkQuestionsDto) {
    return lastValueFrom(
      this.testsClient.send(
        { cmd: 'tests.create-bulk-questions' },
        body.questions
      )
    );
  }

  @Put('questions/:id')
  @ApiOperation({ summary: 'Update an existing test question' })
  @ApiResponse({ status: 200, description: 'Question updated' })
  @ApiParam({ name: 'id', description: 'Question UUID' })
  @ApiBody({ type: UpdateQuestionDto })
  async updateQuestion(@Param('id') id: string, @Body() data: UpdateQuestionDto) {
    return lastValueFrom(this.testsClient.send({ cmd: 'tests.update-question' }, { id, data }));
  }

  @Delete('questions/:id')
  @ApiOperation({ summary: 'Delete a test question' })
  @ApiResponse({ status: 200, description: 'Question deleted' })
  @ApiParam({ name: 'id', description: 'Question UUID' })
  async deleteQuestion(@Param('id') id: string) {
    return lastValueFrom(this.testsClient.send({ cmd: 'tests.delete-question' }, { id }));
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

  @Get('history')
  @ApiOperation({ summary: 'Get history of vocational tests for current user' })
  @ApiResponse({ status: 200, description: 'List of previous test results' })
  async getTestHistory(@CurrentUser() user: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.get-history' }, { userId: user.id })
    );
  }

  @Get('history/:id')
  @ApiOperation({ summary: 'Get details of a specific test from history' })
  @ApiResponse({ status: 200, description: 'Full test details and recommendations' })
  @ApiParam({ name: 'id', description: 'Test UUID' })
  async getTestById(@Param('id') id: string, @CurrentUser() user: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.get-by-id' }, { id, userId: user.id })
    );
  }

  @Patch('history/:id')
  @ApiOperation({ summary: 'Update the name of a test in history' })
  @ApiResponse({ status: 200, description: 'Test name updated' })
  @ApiParam({ name: 'id', description: 'Test UUID' })
  @ApiBody({ type: UpdateTestNameDto })
  async updateTestName(@Param('id') id: string, @CurrentUser() user: any, @Body() body: UpdateTestNameDto) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.update-name' }, { id, userId: user.id, testName: body.testName })
    );
  }

  @Delete('history/:id')
  @ApiOperation({ summary: 'Delete a test from history' })
  @ApiResponse({ status: 200, description: 'Test deleted' })
  @ApiParam({ name: 'id', description: 'Test UUID' })
  async deleteTestFromHistory(@Param('id') id: string, @CurrentUser() user: any) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.delete-test' }, { id, userId: user.id })
    );
  }
}
