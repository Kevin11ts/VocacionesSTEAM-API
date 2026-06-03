import {
  Controller,
  Get,
  Put,
  Body,
  Inject,
  UseGuards,
  Param,
  Delete,
  Post,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CreateSavedUniversityDto, CreateSavedCourseDto } from '@app/common';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { lastValueFrom } from 'rxjs';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersGatewayController {
  constructor(
    @Inject('USERS_SERVICE') private readonly usersClient: ClientProxy,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile and latest test' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  async getProfile(@CurrentUser() user: any) {
    return lastValueFrom(
      this.usersClient.send({ cmd: 'users.get-profile' }, user.id),
    );
  }

  @Put('avatar')
  @ApiOperation({
    summary: 'Update user avatar URL (Mock: sends URL directly)',
  })
  @ApiBody({
    schema: { type: 'object', properties: { avatarUrl: { type: 'string' } } },
  })
  async updateAvatar(
    @CurrentUser() user: any,
    @Body('avatarUrl') avatarUrl: string,
  ) {
    return lastValueFrom(
      this.usersClient.send(
        { cmd: 'users.update-avatar' },
        { userId: user.id, avatarUrl },
      ),
    );
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update user settings' })
  async updateSettings(@CurrentUser() user: any, @Body() settings: any) {
    return lastValueFrom(
      this.usersClient.send(
        { cmd: 'users.update-settings' },
        { userId: user.id, settings },
      ),
    );
  }

  // --- SAVED UNIVERSITIES ---

  @Post('saved-universities')
  @ApiOperation({ summary: 'Save a recommended university' })
  @ApiBody({ type: CreateSavedUniversityDto })
  @ApiResponse({ status: 201, description: 'University saved successfully' })
  async saveUniversity(
    @CurrentUser() user: any,
    @Body() data: CreateSavedUniversityDto,
  ) {
    return lastValueFrom(
      this.usersClient.send(
        { cmd: 'users.save-university' },
        { userId: user.id, data },
      ),
    );
  }

  @Get('saved-universities')
  @ApiOperation({ summary: 'Get saved universities for the current user' })
  @ApiResponse({ status: 200, description: 'List of saved universities' })
  async getSavedUniversities(@CurrentUser() user: any) {
    return lastValueFrom(
      this.usersClient.send({ cmd: 'users.get-saved-universities' }, user.id),
    );
  }

  @Delete('saved-universities/:universityId')
  @ApiOperation({ summary: 'Remove a saved university' })
  @ApiParam({ name: 'universityId', description: 'ID of the saved university' })
  @ApiResponse({ status: 200, description: 'University removed successfully' })
  async removeSavedUniversity(
    @CurrentUser() user: any,
    @Param('universityId') universityId: string,
  ) {
    return lastValueFrom(
      this.usersClient.send(
        { cmd: 'users.remove-saved-university' },
        { userId: user.id, universityId },
      ),
    );
  }

  // --- SAVED COURSES ---

  @Post('saved-courses')
  @ApiOperation({ summary: 'Save a recommended course' })
  @ApiBody({ type: CreateSavedCourseDto })
  @ApiResponse({ status: 201, description: 'Course saved successfully' })
  async saveCourse(
    @CurrentUser() user: any,
    @Body() data: CreateSavedCourseDto,
  ) {
    return lastValueFrom(
      this.usersClient.send(
        { cmd: 'users.save-course' },
        { userId: user.id, data },
      ),
    );
  }

  @Get('saved-courses')
  @ApiOperation({ summary: 'Get saved courses for the current user' })
  @ApiResponse({ status: 200, description: 'List of saved courses' })
  async getSavedCourses(@CurrentUser() user: any) {
    return lastValueFrom(
      this.usersClient.send({ cmd: 'users.get-saved-courses' }, user.id),
    );
  }

  @Delete('saved-courses/:courseId')
  @ApiOperation({ summary: 'Remove a saved course' })
  @ApiParam({ name: 'courseId', description: 'ID of the saved course' })
  @ApiResponse({ status: 200, description: 'Course removed successfully' })
  async removeSavedCourse(
    @CurrentUser() user: any,
    @Param('courseId') courseId: string,
  ) {
    return lastValueFrom(
      this.usersClient.send(
        { cmd: 'users.remove-saved-course' },
        { userId: user.id, courseId },
      ),
    );
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
    return lastValueFrom(
      this.usersClient.send({ cmd: 'users.update' }, { id, data }),
    );
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Eliminar un usuario (Admin)' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  async remove(@Param('id') id: string) {
    return lastValueFrom(this.usersClient.send({ cmd: 'users.remove' }, id));
  }
}
