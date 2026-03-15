import { Controller, Get, Put, Body, Inject, UseGuards, Param, Delete } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { lastValueFrom } from 'rxjs';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersGatewayController {
  constructor(@Inject('USERS_SERVICE') private readonly usersClient: ClientProxy) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile and latest test' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getProfile(@CurrentUser() user: any) {
    return lastValueFrom(this.usersClient.send({ cmd: 'users.get-profile' }, user.id));
  }

  @Put('avatar')
  @ApiOperation({ summary: 'Update user avatar URL (Mock: sends URL directly)' })
  @ApiBody({ schema: { type: 'object', properties: { avatarUrl: { type: 'string' } } } })
  async updateAvatar(@CurrentUser() user: any, @Body('avatarUrl') avatarUrl: string) {
    return lastValueFrom(this.usersClient.send({ cmd: 'users.update-avatar' }, { userId: user.id, avatarUrl }));
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update user settings' })
  async updateSettings(@CurrentUser() user: any, @Body() settings: any) {
    return lastValueFrom(this.usersClient.send({ cmd: 'users.update-settings' }, { userId: user.id, settings }));
  }

  // --- ADMINISTRADOR CRUD ---

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Obtener todos los usuarios (Admin)' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  async findAll() {
    return lastValueFrom(this.usersClient.send({ cmd: 'users.find-all' }, {}));
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Obtener un usuario por ID (Admin)' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  async findOne(@Param('id') id: string) {
    return lastValueFrom(this.usersClient.send({ cmd: 'users.find-one' }, id));
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Actualizar un usuario (Admin)' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  async update(@Param('id') id: string, @Body() data: any) {
    return lastValueFrom(this.usersClient.send({ cmd: 'users.update' }, { id, data }));
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Eliminar un usuario (Admin)' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  async remove(@Param('id') id: string) {
    return lastValueFrom(this.usersClient.send({ cmd: 'users.remove' }, id));
  }
}
