import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { lastValueFrom } from 'rxjs';

@Controller('universities')
export class UniversitiesController {
  constructor(@Inject('AI_SERVICE') private readonly aiClient: ClientProxy) {}

  @Get()
  async getUniversities() {
    return lastValueFrom(this.aiClient.send({ cmd: 'ai.get-universities' }, {}));
  }
}

@Controller('admin/universities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUniversitiesController {
  constructor(@Inject('AI_SERVICE') private readonly aiClient: ClientProxy) {}

  @Post()
  async createUniversity(@Body() data: any) {
    return lastValueFrom(this.aiClient.send({ cmd: 'ai.create-university' }, data));
  }

  @Put(':id')
  async updateUniversity(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(this.aiClient.send({ cmd: 'ai.update-university' }, { id, data }));
  }

  @Delete(':id')
  async deleteUniversity(@Param('id') id: string) {
    return lastValueFrom(this.aiClient.send({ cmd: 'ai.delete-university' }, { id }));
  }
}
