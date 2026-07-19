import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  User,
  UserSettings,
  VocationalTest,
  AiRecommendation,
  SavedUniversity,
  SavedCourse,
  SupportTicket,
  AlgorithmRun,
  UniversityMatchCache,
  OtpCode,
} from '@app/common';
import { RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private readonly settingsRepository: Repository<UserSettings>,
    @InjectRepository(SavedUniversity)
    private readonly savedUniversityRepository: Repository<SavedUniversity>,
    @InjectRepository(SavedCourse)
    private readonly savedCourseRepository: Repository<SavedCourse>,
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepository: Repository<SupportTicket>,
  ) {}

  private supportTicketView(ticket: SupportTicket) {
    return {
      id: ticket.id,
      reference: ticket.reference,
      userId: ticket.userId,
      category: ticket.category,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      attachmentName: ticket.attachmentName,
      attachmentMimeType: ticket.attachmentMimeType,
      attachmentSize: ticket.attachmentSize,
      hasAttachment: !!ticket.attachmentName,
      adminReply: ticket.adminReply,
      repliedAt: ticket.repliedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      user: ticket.user
        ? {
            id: ticket.user.id,
            email: ticket.user.email,
            fullname: ticket.user.fullname,
          }
        : undefined,
    };
  }

  private attachmentMatchesMimeType(data: Buffer, mimeType: string): boolean {
    if (mimeType === 'image/png') {
      return data
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === 'image/jpeg') {
      return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8;
    }
    if (mimeType === 'image/webp') {
      return (
        data.length >= 12 &&
        data.subarray(0, 4).toString('ascii') === 'RIFF' &&
        data.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    if (mimeType === 'application/pdf') {
      return data.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    return false;
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings', 'tests', 'tests.recommendation'],
    });

    if (!user) throw new RpcException('User not found');

    // Retornamos el usuario con su test más reciente si está disponible
    const latestTest = user.tests?.sort(
      (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
    )[0];

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

  async createManagedUser(data: {
    email: string;
    fullname: string;
    password: string;
    role?: string;
    title?: string;
    isEmailVerified?: boolean;
  }) {
    const email = String(data.email || '')
      .trim()
      .toLowerCase();
    const fullname = String(data.fullname || '').trim();
    if (!email || !fullname || String(data.password || '').length < 8) {
      throw new RpcException(
        'Nombre, correo y una contraseña temporal de al menos 8 caracteres son obligatorios.',
      );
    }
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing)
      throw new RpcException('El correo electrónico ya está en uso');
    const role = data.role === 'admin' ? 'admin' : 'student';
    const user = this.userRepository.create({
      email,
      fullname,
      password: await bcrypt.hash(data.password, 10),
      role,
      title: String(data.title || '').trim() || 'Explorador STEAM',
      isEmailVerified: Boolean(data.isEmailVerified),
      settings: new UserSettings(),
    });
    const saved = await this.userRepository.save(user);
    const { password, hashedRefreshToken, ...safeUser } = saved;
    return safeUser;
  }

  async update(id: string, updateData: Partial<User>, actorId?: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new RpcException('Usuario no encontrado');

    const clean: Partial<User> = {};
    if (updateData.fullname !== undefined) {
      clean.fullname = String(updateData.fullname).trim();
      if (!clean.fullname)
        throw new RpcException('El nombre no puede quedar vacío.');
    }
    if (updateData.email !== undefined) {
      const email = String(updateData.email).trim().toLowerCase();
      const duplicate = await this.userRepository.findOne({ where: { email } });
      if (duplicate && duplicate.id !== id) {
        throw new RpcException('El correo electrónico ya está en uso');
      }
      clean.email = email;
    }
    if (updateData.title !== undefined) {
      clean.title = String(updateData.title).trim() || 'Explorador STEAM';
    }
    if (updateData.isEmailVerified !== undefined) {
      const nextVerified = Boolean(updateData.isEmailVerified);
      if (user.isEmailVerified && !nextVerified) {
        clean.hashedRefreshToken = null;
      }
      clean.isEmailVerified = nextVerified;
    }
    if (updateData.role !== undefined) {
      const nextRole = updateData.role === 'admin' ? 'admin' : 'student';
      if (user.role === 'admin' && nextRole !== 'admin') {
        if (actorId === id) {
          throw new RpcException(
            'No puedes quitarte tu propio acceso de administrador.',
          );
        }
        await this.assertNotLastAdmin();
      }
      if (user.role !== nextRole) {
        // El próximo refresh no debe reutilizar una sesión emitida con el rol
        // anterior. El access token restante se revalida contra BD en gateway.
        clean.hashedRefreshToken = null;
      }
      clean.role = nextRole;
    }

    Object.assign(user, clean);
    const updatedUser = await this.userRepository.save(user);
    const { password, hashedRefreshToken, ...safeUser } = updatedUser;
    return safeUser;
  }

  async remove(id: string, actorId?: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new RpcException('Usuario no encontrado');
    if (actorId === id) {
      throw new RpcException(
        'No puedes eliminar tu propia cuenta administrativa.',
      );
    }
    if (user.role === 'admin') await this.assertNotLastAdmin();
    await this.userRepository.remove(user);
    return { message: 'Usuario eliminado correctamente' };
  }

  private async assertNotLastAdmin(): Promise<void> {
    const adminCount = await this.userRepository.count({
      where: { role: 'admin' },
    });
    if (adminCount <= 1) {
      throw new RpcException(
        'Debe permanecer al menos un administrador activo.',
      );
    }
  }

  /**
   * Modera una cuenta (acción del admin):
   *  - suspend:    bloqueo temporal `durationDays` días.
   *  - ban:        bloqueo permanente.
   *  - reactivate: limpia cualquier bloqueo.
   * Se revoca también el refresh token para cerrar sesiones activas.
   */
  async setSuspension(payload: {
    id: string;
    action: 'suspend' | 'ban' | 'reactivate';
    durationDays?: number;
    reason?: string;
  }) {
    const user = await this.userRepository.findOne({
      where: { id: payload.id },
    });
    if (!user) throw new RpcException('Usuario no encontrado');

    if (user.role === 'admin' && payload.action !== 'reactivate') {
      throw new RpcException('No se puede suspender a un administrador.');
    }

    if (payload.action === 'reactivate') {
      user.isBanned = false;
      user.suspendedUntil = null;
      user.suspensionReason = null;
    } else if (payload.action === 'ban') {
      user.isBanned = true;
      user.suspendedUntil = null;
      user.suspensionReason = payload.reason?.trim() || null;
    } else {
      // suspend temporal
      const days = Math.max(1, Math.floor(payload.durationDays ?? 7));
      user.isBanned = false;
      user.suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      user.suspensionReason = payload.reason?.trim() || null;
    }

    // Invalida las sesiones activas del usuario moderado.
    if (payload.action !== 'reactivate') {
      user.hashedRefreshToken = null;
    }

    const saved = await this.userRepository.save(user);
    const { password, ...safeUser } = saved;
    return safeUser;
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    user.avatarUrl = avatarUrl;
    const saved = await this.userRepository.save(user);
    const { password, ...safeUser } = saved;
    return safeUser;
  }

  /**
   * Actualiza los datos del propio perfil. Solo se permiten campos no
   * sensibles (whitelist): nunca role, email, password ni nivel de acceso.
   */
  async updateOwnProfile(
    userId: string,
    data: {
      fullname?: string;
      bio?: string;
      birthDate?: string;
      phone?: string;
      location?: string;
      github?: string;
      linkedin?: string;
    },
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    const allowed: (keyof typeof data)[] = [
      'fullname',
      'bio',
      'birthDate',
      'phone',
      'location',
      'github',
      'linkedin',
    ];
    for (const key of allowed) {
      const value = data[key];
      if (value !== undefined) {
        (user as any)[key] = typeof value === 'string' ? value.trim() : value;
      }
    }

    const saved = await this.userRepository.save(user);
    const { password, ...safeUser } = saved;
    return { message: 'Perfil actualizado', user: safeUser };
  }

  /** Registra la aceptación del Aviso de Privacidad y los Términos. */
  async acceptTerms(userId: string, version: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    user.acceptedTermsVersion = version;
    user.acceptedTermsAt = new Date();
    const saved = await this.userRepository.save(user);
    const { password, ...safeUser } = saved;
    return {
      message: 'Consentimiento registrado',
      acceptedTermsVersion: saved.acceptedTermsVersion,
      acceptedTermsAt: saved.acceptedTermsAt,
      user: safeUser,
    };
  }

  async updateSettings(userId: string, settingsDto: Partial<UserSettings>) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings'],
    });
    if (!user) throw new RpcException('User not found');

    // Whitelist: solo columnas conocidas de UserSettings (evita inyectar
    // claves arbitrarias enviadas por el cliente).
    const allowed: (keyof UserSettings)[] = [
      'darkMode',
      'language',
      'pushEnabled',
      'emailEnabled',
      'emailMarketing',
      'weeklySummary',
      'newCareersAlerts',
      'testReminders',
      'communityMessages',
    ];
    const clean: Partial<UserSettings> = {};
    for (const key of allowed) {
      if (settingsDto[key] !== undefined) {
        (clean as any)[key] = settingsDto[key];
      }
    }

    const updatedSettings = Object.assign(
      user.settings ?? this.settingsRepository.create({ user }),
      clean,
    );
    const notificationKeys: (keyof UserSettings)[] = [
      'pushEnabled',
      'emailEnabled',
      'emailMarketing',
      'weeklySummary',
      'newCareersAlerts',
      'testReminders',
      'communityMessages',
    ];
    if (notificationKeys.some((key) => settingsDto[key] !== undefined)) {
      updatedSettings.notificationsConfiguredAt = new Date();
    }
    user.settings = await this.settingsRepository.save(updatedSettings);

    const { password, ...safeUser } = user;
    return { message: 'Settings updated', user: safeUser };
  }

  // --- SOPORTE ---

  async createSupportTicket(
    userId: string,
    data: { category: string; subject: string; message: string },
    attachment?: {
      name: string;
      mimeType: string;
      size: number;
      dataBase64: string;
    },
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);
    if (
      attachment &&
      (!allowedMimeTypes.has(attachment.mimeType) ||
        attachment.size <= 0 ||
        attachment.size > 5 * 1024 * 1024)
    ) {
      throw new RpcException(
        'El archivo debe ser una imagen o PDF de máximo 5 MB.',
      );
    }

    let reference = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      reference = `SUP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const exists = await this.supportTicketRepository.exist({
        where: { reference },
      });
      if (!exists) break;
    }

    const attachmentData = attachment
      ? Buffer.from(attachment.dataBase64, 'base64')
      : null;
    if (
      attachmentData &&
      (attachmentData.length !== attachment?.size ||
        attachmentData.length > 5 * 1024 * 1024 ||
        !this.attachmentMatchesMimeType(
          attachmentData,
          attachment?.mimeType ?? '',
        ))
    ) {
      throw new RpcException(
        'El contenido del archivo no coincide con una imagen o PDF válido.',
      );
    }

    const ticket = this.supportTicketRepository.create({
      reference,
      user,
      userId,
      category: data.category,
      subject: data.subject.trim(),
      message: data.message.trim(),
      status: 'open',
      attachmentName: attachment?.name.slice(0, 255) ?? null,
      attachmentMimeType: attachment?.mimeType ?? null,
      attachmentSize: attachment?.size ?? null,
      attachmentData,
      adminReply: null,
      repliedAt: null,
    });
    const saved = await this.supportTicketRepository.save(ticket);
    return {
      ticket: this.supportTicketView(saved),
      requester: { email: user.email, fullname: user.fullname },
    };
  }

  async getOwnSupportTickets(userId: string) {
    const tickets = await this.supportTicketRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return tickets.map((ticket) => this.supportTicketView(ticket));
  }

  async getAllSupportTickets() {
    const tickets = await this.supportTicketRepository.find({
      relations: ['user'],
      order: { updatedAt: 'DESC' },
    });
    return tickets.map((ticket) => this.supportTicketView(ticket));
  }

  async getSupportAttachment(
    ticketId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const ticket = await this.supportTicketRepository
      .createQueryBuilder('ticket')
      .addSelect('ticket.attachmentData')
      .where('ticket.id = :ticketId', { ticketId })
      .getOne();
    if (
      !ticket ||
      (requesterRole !== 'admin' && ticket.userId !== requesterId)
    ) {
      throw new RpcException('Ticket no encontrado');
    }
    if (!ticket.attachmentData || !ticket.attachmentName) {
      throw new RpcException('Este ticket no tiene archivo adjunto');
    }
    return {
      name: ticket.attachmentName,
      mimeType: ticket.attachmentMimeType || 'application/octet-stream',
      dataBase64: ticket.attachmentData.toString('base64'),
    };
  }

  async updateSupportTicket(
    ticketId: string,
    data: { status?: string; reply?: string },
  ) {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id: ticketId },
      relations: ['user'],
    });
    if (!ticket) throw new RpcException('Ticket no encontrado');

    const reply = data.reply?.trim();
    const replyChanged = !!reply && reply !== ticket.adminReply;
    if (data.status) ticket.status = data.status;
    if (reply) {
      ticket.adminReply = reply;
      ticket.repliedAt = new Date();
      if (!data.status && ticket.status === 'open') ticket.status = 'in_review';
    }
    const saved = await this.supportTicketRepository.save(ticket);
    return {
      ticket: this.supportTicketView(saved),
      replyChanged,
      requester: { email: ticket.user.email, fullname: ticket.user.fullname },
    };
  }

  // --- AUTOELIMINACIÓN DE CUENTA ---

  async deleteOwnAccount(
    userId: string,
    confirmation: string,
    password?: string,
  ) {
    if (confirmation !== 'ELIMINAR') {
      throw new RpcException('Escribe ELIMINAR para confirmar la operación.');
    }
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');
    if (user.role === 'admin') await this.assertNotLastAdmin();
    if (user.password) {
      if (!password || !(await bcrypt.compare(password, user.password))) {
        throw new RpcException('La contraseña actual no es correcta.');
      }
    }

    await this.userRepository.manager.transaction(async (manager) => {
      // Estas tablas guardan userId sin FK; se limpian explícitamente para que
      // la eliminación incluya cachés, trazas algorítmicas y OTP del correo.
      await manager.delete(AlgorithmRun, { userId });
      await manager.delete(UniversityMatchCache, { userId });
      await manager.delete(OtpCode, { email: user.email });
      await manager.delete(User, { id: userId });
    });
    return { success: true, message: 'Cuenta y datos personales eliminados.' };
  }

  // --- SAVED UNIVERSITIES ---

  async saveUniversity(userId: string, data: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    // Evita duplicados: la misma universidad (por nombre, sin distinguir
    // mayúsculas) no puede guardarse dos veces para el mismo usuario.
    const existing = await this.savedUniversityRepository
      .createQueryBuilder('saved')
      .innerJoin('saved.user', 'owner')
      .where('owner.id = :userId', { userId })
      .andWhere('LOWER(saved.universityName) = LOWER(:name)', {
        name: (data.universityName || '').trim(),
      })
      .getOne();
    if (existing) {
      throw new RpcException('University already saved');
    }

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

  // --- SAVED COURSES ---

  async saveCourse(userId: string, data: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');

    const savedCourse = this.savedCourseRepository.create({
      ...data,
      user,
    });

    return this.savedCourseRepository.save(savedCourse);
  }

  async getSavedCourses(userId: string) {
    return this.savedCourseRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async removeSavedCourse(userId: string, courseId: string) {
    const savedCourse = await this.savedCourseRepository.findOne({
      where: { id: courseId, user: { id: userId } },
    });

    if (!savedCourse) throw new RpcException('Saved course not found');

    await this.savedCourseRepository.remove(savedCourse);
    return { message: 'Saved course removed successfully' };
  }
}
