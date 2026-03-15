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
  async updateAvatar(@Payload() payload: { userId: string; avatarUrl: string }) {
    return this.usersService.updateAvatar(payload.userId, payload.avatarUrl);
  }

  @MessagePattern({ cmd: 'users.update-settings' })
  async updateSettings(@Payload() payload: { userId: string; settings: Partial<UserSettings> }) {
    return this.usersService.updateSettings(payload.userId, payload.settings);
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
}
