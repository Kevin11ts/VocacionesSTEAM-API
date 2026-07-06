import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { UserSettings } from '@app/common';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern({ cmd: 'users.get-profile' })
  async getProfile(@Payload() userId: string) {
    return this.usersService.getProfile(userId);
  }

  @MessagePattern({ cmd: 'users.update-avatar' })
  async updateAvatar(
    @Payload() payload: { userId: string; avatarUrl: string },
  ) {
    return this.usersService.updateAvatar(payload.userId, payload.avatarUrl);
  }

  @MessagePattern({ cmd: 'users.update-own-profile' })
  async updateOwnProfile(
    @Payload() payload: { userId: string; data: any },
  ) {
    return this.usersService.updateOwnProfile(payload.userId, payload.data);
  }

  @MessagePattern({ cmd: 'users.accept-terms' })
  async acceptTerms(
    @Payload() payload: { userId: string; version: string },
  ) {
    return this.usersService.acceptTerms(payload.userId, payload.version);
  }

  @MessagePattern({ cmd: 'users.update-settings' })
  async updateSettings(
    @Payload() payload: { userId: string; settings: Partial<UserSettings> },
  ) {
    return this.usersService.updateSettings(payload.userId, payload.settings);
  }

  // --- SAVED UNIVERSITIES ---

  @MessagePattern({ cmd: 'users.save-university' })
  async saveUniversity(@Payload() payload: { userId: string; data: any }) {
    return this.usersService.saveUniversity(payload.userId, payload.data);
  }

  @MessagePattern({ cmd: 'users.get-saved-universities' })
  async getSavedUniversities(@Payload() userId: string) {
    return this.usersService.getSavedUniversities(userId);
  }

  @MessagePattern({ cmd: 'users.remove-saved-university' })
  async removeSavedUniversity(
    @Payload() payload: { userId: string; universityId: string },
  ) {
    return this.usersService.removeSavedUniversity(
      payload.userId,
      payload.universityId,
    );
  }

  // --- SAVED COURSES ---

  @MessagePattern({ cmd: 'users.save-course' })
  async saveCourse(@Payload() payload: { userId: string; data: any }) {
    return this.usersService.saveCourse(payload.userId, payload.data);
  }

  @MessagePattern({ cmd: 'users.get-saved-courses' })
  async getSavedCourses(@Payload() userId: string) {
    return this.usersService.getSavedCourses(userId);
  }

  @MessagePattern({ cmd: 'users.remove-saved-course' })
  async removeSavedCourse(
    @Payload() payload: { userId: string; courseId: string },
  ) {
    return this.usersService.removeSavedCourse(
      payload.userId,
      payload.courseId,
    );
  }

  // --- ADMINISTRADOR CRUD ---

  @MessagePattern({ cmd: 'users.find-all' })
  async findAll() {
    return this.usersService.findAll();
  }

  @MessagePattern({ cmd: 'users.find-one' })
  async findOne(@Payload() id: string) {
    return this.usersService.findOne(id);
  }

  @MessagePattern({ cmd: 'users.update' })
  async update(@Payload() payload: { id: string; data: any }) {
    return this.usersService.update(payload.id, payload.data);
  }

  @MessagePattern({ cmd: 'users.remove' })
  async remove(@Payload() id: string) {
    return this.usersService.remove(id);
  }

  @MessagePattern({ cmd: 'users.set-suspension' })
  async setSuspension(
    @Payload()
    payload: {
      id: string;
      action: 'suspend' | 'ban' | 'reactivate';
      durationDays?: number;
      reason?: string;
    },
  ) {
    return this.usersService.setSuspension(payload);
  }
}
