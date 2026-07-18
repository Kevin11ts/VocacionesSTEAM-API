import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateQuestionDto, UpdateQuestionDto } from '@app/common';
import { lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@ApiTags('Admin Questions')
@ApiBearerAuth()
@Controller('admin/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminQuestionsController {
  constructor(
    @Inject('TESTS_SERVICE') private readonly testsClient: ClientProxy,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar todas las preguntas, incluidas las inactivas',
  })
  async getAll() {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.admin-get-questions' }, {}),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Crear una pregunta del test vocacional' })
  async create(@Body() data: CreateQuestionDto) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.create-question' }, data),
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar una pregunta del test vocacional' })
  async update(@Param('id') id: string, @Body() data: UpdateQuestionDto) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.update-question' }, { id, data }),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una pregunta del test vocacional' })
  async remove(@Param('id') id: string) {
    return lastValueFrom(
      this.testsClient.send({ cmd: 'tests.delete-question' }, { id }),
    );
  }
}
