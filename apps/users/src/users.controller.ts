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
  async updateOwnProfile(@Payload() payload: { userId: string; data: any }) {
    return this.usersService.updateOwnProfile(payload.userId, payload.data);
  }

  @MessagePattern({ cmd: 'users.accept-terms' })
  async acceptTerms(@Payload() payload: { userId: string; version: string }) {
    return this.usersService.acceptTerms(payload.userId, payload.version);
  }

  @MessagePattern({ cmd: 'users.update-settings' })
  async updateSettings(
    @Payload() payload: { userId: string; settings: Partial<UserSettings> },
  ) {
    return this.usersService.updateSettings(payload.userId, payload.settings);
  }

  @MessagePattern({ cmd: 'support.create' })
  async createSupportTicket(
    @Payload()
    payload: {
      userId: string;
      data: { category: string; subject: string; message: string };
      attachment?: {
        name: string;
        mimeType: string;
        size: number;
        dataBase64: string;
      };
    },
  ) {
    return this.usersService.createSupportTicket(
      payload.userId,
      payload.data,
      payload.attachment,
    );
  }

  @MessagePattern({ cmd: 'support.list-own' })
  async getOwnSupportTickets(@Payload() userId: string) {
    return this.usersService.getOwnSupportTickets(userId);
  }

  @MessagePattern({ cmd: 'support.list-all' })
  async getAllSupportTickets() {
    return this.usersService.getAllSupportTickets();
  }

  @MessagePattern({ cmd: 'support.attachment' })
  async getSupportAttachment(
    @Payload()
    payload: {
      ticketId: string;
      requesterId: string;
      requesterRole: string;
    },
  ) {
    return this.usersService.getSupportAttachment(
      payload.ticketId,
      payload.requesterId,
      payload.requesterRole,
    );
  }

  @MessagePattern({ cmd: 'support.update' })
  async updateSupportTicket(
    @Payload()
    payload: {
      ticketId: string;
      data: { status?: string; reply?: string };
    },
  ) {
    return this.usersService.updateSupportTicket(
      payload.ticketId,
      payload.data,
    );
  }

  @MessagePattern({ cmd: 'users.delete-own-account' })
  async deleteOwnAccount(
    @Payload()
    payload: {
      userId: string;
      confirmation: string;
      password?: string;
    },
  ) {
    return this.usersService.deleteOwnAccount(
      payload.userId,
      payload.confirmation,
      payload.password,
    );
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

  @MessagePattern({ cmd: 'users.create-managed' })
  async createManaged(@Payload() data: any) {
    return this.usersService.createManagedUser(data);
  }

  @MessagePattern({ cmd: 'users.find-all' })
  async findAll() {
    return this.usersService.findAll();
  }

  @MessagePattern({ cmd: 'users.find-one' })
  async findOne(@Payload() id: string) {
    return this.usersService.findOne(id);
  }

  @MessagePattern({ cmd: 'users.update' })
  async update(
    @Payload() payload: { id: string; data: any; actorId?: string },
  ) {
    return this.usersService.update(payload.id, payload.data, payload.actorId);
  }

  @MessagePattern({ cmd: 'users.remove' })
  async remove(@Payload() payload: { id: string; actorId?: string }) {
    return this.usersService.remove(payload.id, payload.actorId);
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
