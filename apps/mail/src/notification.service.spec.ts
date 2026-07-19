import { NotificationService } from './notification.service';
import * as webPush from 'web-push';

describe('NotificationService VAPID', () => {
  it('generates and persists an application key pair when env vars are absent', async () => {
    const configRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as any;
    const service = new NotificationService(
      { get: jest.fn((_key, fallback) => fallback) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      configRepository,
      {} as any,
      {} as any,
    );

    const result = await service.getPublicKey();

    expect(result.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(configRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'vapid',
        value: expect.objectContaining({
          publicKey: result.publicKey,
          privateKey: expect.any(String),
        }),
      }),
    );
  });

  it('records a failed delivery when push is enabled but no device is subscribed', async () => {
    const keys = webPush.generateVAPIDKeys();
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'VAPID_PUBLIC_KEY') return keys.publicKey;
        if (key === 'VAPID_PRIVATE_KEY') return keys.privateKey;
        return fallback;
      }),
    } as any;
    const deliveryRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as any;
    const service = new NotificationService(
      config,
      {} as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'student@example.com',
          settings: { pushEnabled: true },
        }),
      } as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      deliveryRepository,
      {} as any,
    );

    await expect(service.sendTest('user-1')).rejects.toThrow(
      'No hay una suscripción push activa',
    );
    expect(deliveryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'push',
        status: 'failed',
        recipient: '0 dispositivos',
      }),
    );
  });
});
