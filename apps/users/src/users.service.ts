import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserSettings, VocationalTest, AiRecommendation, SavedUniversity } from '@app/common';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(UserSettings) private readonly settingsRepository: Repository<UserSettings>,
    @InjectRepository(SavedUniversity) private readonly savedUniversityRepository: Repository<SavedUniversity>
  ) {}

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings', 'tests', 'tests.recommendation'],
    });

    if (!user) throw new RpcException('User not found');

    // Retornamos el usuario con su test más reciente si está disponible
    const latestTest = user.tests?.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())[0];
    
    // Omitimos la contraseña
    const { password, ...safeUser } = user;
    return { ...safeUser, latestTest };
  }

  async findAll() {
    const users = await this.userRepository.find({
      relations: ['settings', 'tests'],
    });
    return users.map(({ password, ...safeUser }) => safeUser);
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['settings', 'tests', 'tests.recommendation'],
    });
    if (!user) throw new RpcException('Usuario no encontrado');
    const { password, ...safeUser } = user;
    return safeUser;
  }

  async update(id: string, updateData: Partial<User>) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new RpcException('Usuario no encontrado');
    
    // Ignorar actualización de password directa por seguridad.
    if (updateData.password) {
      delete updateData.password;
    }

    Object.assign(user, updateData);
    const updatedUser = await this.userRepository.save(user);
    const { password, ...safeUser } = updatedUser;
    return safeUser;
  }

  async remove(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new RpcException('Usuario no encontrado');
    await this.userRepository.remove(user);
    return { message: 'Usuario eliminado correctamente' };
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    user.avatarUrl = avatarUrl;
    return this.userRepository.save(user);
  }

  async updateSettings(userId: string, settingsDto: Partial<UserSettings>) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings']
    });
    if (!user) throw new RpcException('User not found');

    const updatedSettings = Object.assign(user.settings, settingsDto);
    user.settings = await this.settingsRepository.save(updatedSettings);

    const { password, ...safeUser } = user;
    return { message: 'Settings updated', user: safeUser };
  }

  // --- SAVED UNIVERSITIES ---

  async saveUniversity(userId: string, data: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    const savedUniversity = this.savedUniversityRepository.create({
      ...data,
      user,
    });

    return this.savedUniversityRepository.save(savedUniversity);
  }

  async getSavedUniversities(userId: string) {
    return this.savedUniversityRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async removeSavedUniversity(userId: string, universityId: string) {
    const savedUniversity = await this.savedUniversityRepository.findOne({
      where: { id: universityId, user: { id: userId } },
    });

    if (!savedUniversity) throw new RpcException('Saved university not found');

    await this.savedUniversityRepository.remove(savedUniversity);
    return { message: 'Saved university removed successfully' };
  }
}
