import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import {
  NotificationCampaign,
  NotificationConfig,
  NotificationDelivery,
  PushSubscriptionEntity,
  SendNotificationCampaignDto,
  User,
  VocationalTest,
} from '@app/common';
import { RpcException } from '@nestjs/microservices';
import { MailService } from './mail.service';

interface NotificationMessage {
  type: string;
  title: string;
  message: string;
  url?: string;
  channels: string[];
  dedupeBase?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private vapidReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(VocationalTest)
    private readonly testRepository: Repository<VocationalTest>,
    @InjectRepository(PushSubscriptionEntity)
    private readonly subscriptionRepository: Repository<PushSubscriptionEntity>,
    @InjectRepository(NotificationConfig)
    private readonly configRepository: Repository<NotificationConfig>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepository: Repository<NotificationDelivery>,
    @InjectRepository(NotificationCampaign)
    private readonly campaignRepository: Repository<NotificationCampaign>,
  ) {}

  private async ensureVapidKeys(): Promise<{
    publicKey: string;
    privateKey: string;
  }> {
    const fromEnvironment = {
      publicKey: this.configService.get<string>('VAPID_PUBLIC_KEY'),
      privateKey: this.configService.get<string>('VAPID_PRIVATE_KEY'),
    };
    let keys: { publicKey: string; privateKey: string };
    if (fromEnvironment.publicKey && fromEnvironment.privateKey) {
      keys = {
        publicKey: fromEnvironment.publicKey,
        privateKey: fromEnvironment.privateKey,
      };
    } else {
      const stored = await this.configRepository.findOne({
        where: { key: 'vapid' },
      });
      const value = stored?.value as
        | { publicKey?: string; privateKey?: string }
        | undefined;
      if (value?.publicKey && value.privateKey) {
        keys = { publicKey: value.publicKey, privateKey: value.privateKey };
      } else {
        keys = webPush.generateVAPIDKeys();
        try {
          await this.configRepository.save(
            this.configRepository.create({ key: 'vapid', value: keys }),
          );
        } catch {
          const raced = await this.configRepository.findOne({
            where: { key: 'vapid' },
          });
          const racedValue = raced?.value as {
            publicKey?: string;
            privateKey?: string;
          };
          if (!racedValue?.publicKey || !racedValue.privateKey)
            throw new Error('VAPID unavailable');
          keys = {
            publicKey: racedValue.publicKey,
            privateKey: racedValue.privateKey,
          };
        }
      }
    }

    if (!this.vapidReady) {
      const subject = this.configService.get<string>(
        'VAPID_SUBJECT',
        'mailto:vocaciones.steam0@gmail.com',
      );
      webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
      this.vapidReady = true;
    }
    return keys;
  }

  async getPublicKey() {
    const keys = await this.ensureVapidKeys();
    return { publicKey: keys.publicKey };
  }

  async subscribe(
    userId: string,
    data: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    },
  ) {
    if (
      !data.endpoint?.startsWith('https://') ||
      !data.keys?.p256dh ||
      !data.keys?.auth
    ) {
      throw new RpcException('Suscripción push inválida');
    }
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new RpcException('User not found');
    await this.ensureVapidKeys();

    let subscription = await this.subscriptionRepository.findOne({
      where: { endpoint: data.endpoint },
    });
    if (subscription) {
      subscription.user = user;
      subscription.userId = userId;
      subscription.p256dh = data.keys.p256dh;
      subscription.auth = data.keys.auth;
      subscription.userAgent = data.userAgent?.slice(0, 500) ?? null;
      subscription.failureCount = 0;
    } else {
      subscription = this.subscriptionRepository.create({
        user,
        userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: data.userAgent?.slice(0, 500) ?? null,
        failureCount: 0,
        lastSuccessAt: null,
      });
    }
    await this.subscriptionRepository.save(subscription);
    return { subscribed: true };
  }

  async unsubscribe(userId: string) {
    const result = await this.subscriptionRepository.delete({ userId });
    return { unsubscribed: true, removed: result.affected ?? 0 };
  }

  private async alreadyDelivered(dedupeKey?: string): Promise<boolean> {
    if (!dedupeKey) return false;
    return this.deliveryRepository.exist({ where: { dedupeKey } });
  }

  private async record(
    user: User,
    channel: string,
    type: string,
    status: string,
    recipient: string | null,
    error?: unknown,
    dedupeKey?: string,
  ) {
    await this.deliveryRepository.save(
      this.deliveryRepository.create({
        user,
        userId: user.id,
        channel,
        type,
        status,
        recipient,
        error: error
          ? String(error instanceof Error ? error.message : error).slice(
              0,
              2000,
            )
          : null,
        dedupeKey: status === 'delivered' ? (dedupeKey ?? null) : null,
      }),
    );
  }

  private async push(user: User, notification: NotificationMessage) {
    const dedupeKey = notification.dedupeBase
      ? `${notification.dedupeBase}:push`
      : undefined;
    if (await this.alreadyDelivered(dedupeKey))
      return { delivered: 0, failed: 0 };
    await this.ensureVapidKeys();
    const subscriptions = await this.subscriptionRepository.find({
      where: { userId: user.id },
    });
    if (!subscriptions.length) {
      await this.record(
        user,
        'push',
        notification.type,
        'failed',
        '0 dispositivos',
        'No hay una suscripción push activa',
      );
      return { delivered: 0, failed: 1 };
    }

    const payload = JSON.stringify({
      notification: {
        title: notification.title,
        body: notification.message,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        data: {
          onActionClick: {
            default: {
              operation: 'navigateLastFocusedOrOpen',
              url: notification.url || '/dashboard',
            },
          },
        },
      },
    });
    let delivered = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        subscription.failureCount = 0;
        subscription.lastSuccessAt = new Date();
        await this.subscriptionRepository.save(subscription);
        delivered++;
      } catch (error: any) {
        failed++;
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await this.subscriptionRepository.delete({ id: subscription.id });
        } else {
          subscription.failureCount += 1;
          await this.subscriptionRepository.save(subscription);
        }
      }
    }
    await this.record(
      user,
      'push',
      notification.type,
      delivered === 0 ? 'failed' : failed > 0 ? 'partial' : 'delivered',
      `${subscriptions.length} dispositivo(s)`,
      failed > 0 ? `${failed} dispositivo(s) rechazaron el mensaje` : undefined,
      dedupeKey,
    );
    return {
      delivered: delivered > 0 ? 1 : 0,
      failed: failed > 0 ? 1 : 0,
    };
  }

  private async email(user: User, notification: NotificationMessage) {
    const dedupeKey = notification.dedupeBase
      ? `${notification.dedupeBase}:email`
      : undefined;
    if (await this.alreadyDelivered(dedupeKey))
      return { delivered: 0, failed: 0 };
    try {
      await this.mailService.sendNotificationEmail(
        user.email,
        notification.title,
        notification.message,
        notification.url,
      );
      await this.record(
        user,
        'email',
        notification.type,
        'delivered',
        user.email,
        undefined,
        dedupeKey,
      );
      return { delivered: 1, failed: 0 };
    } catch (error) {
      await this.record(
        user,
        'email',
        notification.type,
        'failed',
        user.email,
        error,
      );
      return { delivered: 0, failed: 1 };
    }
  }

  private async sendToUser(user: User, notification: NotificationMessage) {
    let delivered = 0;
    let failed = 0;
    const settings = user.settings;
    if (notification.channels.includes('push') && settings?.pushEnabled) {
      const result = await this.push(user, notification);
      delivered += result.delivered;
      failed += result.failed;
    }
    if (notification.channels.includes('email') && settings?.emailEnabled) {
      const result = await this.email(user, notification);
      delivered += result.delivered;
      failed += result.failed;
    }
    return { delivered, failed };
  }

  async sendTest(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings'],
    });
    if (!user) throw new RpcException('User not found');
    const result = await this.push(user, {
      type: 'test',
      title: 'Notificaciones activas',
      message: 'Este dispositivo ya puede recibir avisos de Vocaciones STEAM.',
      url: '/profile/notifications',
      channels: ['push'],
    });
    if (!result.delivered) {
      throw new RpcException(
        'No hay una suscripción push activa en tu cuenta.',
      );
    }
    return result;
  }

  private categoryEnabled(user: User, category: string): boolean {
    const settings = user.settings;
    if (!settings?.notificationsConfiguredAt) return false;
    if (category === 'new_careers') return settings.newCareersAlerts;
    if (category === 'marketing') return settings.emailMarketing;
    if (category === 'community') return settings.communityMessages;
    return true;
  }

  async sendCampaign(data: SendNotificationCampaignDto, sentBy?: string) {
    const campaign = await this.campaignRepository.save(
      this.campaignRepository.create({
        title: data.title,
        message: data.message,
        url: data.url ?? null,
        category: data.category,
        channels: [...new Set(data.channels)],
        sentBy: sentBy ?? null,
        status: 'processing',
        recipients: 0,
        delivered: 0,
        failed: 0,
        sentAt: null,
      }),
    );
    const users = await this.userRepository.find({ relations: ['settings'] });
    const eligible = users.filter(
      (user) =>
        this.categoryEnabled(user, data.category) &&
        data.channels.some(
          (channel) =>
            (channel === 'push' && user.settings?.pushEnabled) ||
            (channel === 'email' && user.settings?.emailEnabled),
        ),
    );
    campaign.recipients = eligible.length;
    for (const user of eligible) {
      const result = await this.sendToUser(user, {
        type: `campaign_${data.category}`,
        title: data.title,
        message: data.message,
        url: data.url,
        channels: campaign.channels,
        dedupeBase: `campaign:${campaign.id}:${user.id}`,
      });
      campaign.delivered += result.delivered;
      campaign.failed += result.failed;
    }
    campaign.status =
      campaign.failed === 0
        ? 'completed'
        : campaign.delivered > 0
          ? 'partial'
          : 'failed';
    campaign.sentAt = new Date();
    return this.campaignRepository.save(campaign);
  }

  async listCampaigns() {
    return this.campaignRepository.find({
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async listDeliveries() {
    return this.deliveryRepository.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  @Cron('0 9 * * 1', { timeZone: 'America/Mexico_City' })
  async sendWeeklySummaries() {
    const users = await this.userRepository.find({ relations: ['settings'] });
    const week = this.weekKey(new Date());
    for (const user of users.filter(
      (item) =>
        item.settings?.notificationsConfiguredAt && item.settings.weeklySummary,
    )) {
      const tests = await this.testRepository.count({
        where: { user: { id: user.id } },
      });
      await this.sendToUser(user, {
        type: 'weekly_summary',
        title: 'Tu resumen semanal STEAM',
        message: `Esta semana tu cuenta conserva ${tests} evaluación${tests === 1 ? '' : 'es'} en el historial. Entra para revisar tu perfil y continuar calibrándolo.`,
        url: '/dashboard',
        channels: ['push', 'email'],
        dedupeBase: `weekly:${week}:${user.id}`,
      });
    }
  }

  @Cron('0 10 * * *', { timeZone: 'America/Mexico_City' })
  async sendTestReminders() {
    const users = await this.userRepository.find({ relations: ['settings'] });
    const week = this.weekKey(new Date());
    for (const user of users.filter(
      (item) =>
        item.settings?.notificationsConfiguredAt && item.settings.testReminders,
    )) {
      const latest = await this.testRepository.findOne({
        where: { user: { id: user.id } },
        order: { completedAt: 'DESC' },
      });
      const stale =
        !latest ||
        Date.now() - latest.completedAt.getTime() > 30 * 24 * 60 * 60 * 1000;
      if (!stale) continue;
      await this.sendToUser(user, {
        type: 'test_reminder',
        title: latest
          ? 'Actualiza tu perfil vocacional'
          : 'Comienza tu test vocacional',
        message: latest
          ? 'Tus intereses cambian. Vuelve a evaluar tu perfil para mantener tus recomendaciones al día.'
          : 'Completa tu primera evaluación y descubre qué áreas STEAM encajan contigo.',
        url: '/evaluations',
        channels: ['push', 'email'],
        dedupeBase: `reminder:${week}:${user.id}`,
      });
    }
  }

  private weekKey(date: Date): string {
    const monday = new Date(date);
    const day = monday.getUTCDay() || 7;
    monday.setUTCDate(monday.getUTCDate() - day + 1);
    return monday.toISOString().slice(0, 10);
  }
}
