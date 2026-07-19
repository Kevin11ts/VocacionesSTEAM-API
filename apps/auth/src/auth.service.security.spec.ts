import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { AuthService } from './auth.service';

describe('AuthService security controls', () => {
  const verifiedUser = {
    id: 'user-1',
    email: 'student@example.com',
    role: 'student',
    isEmailVerified: true,
    isBanned: false,
    suspendedUntil: null,
    suspensionReason: null,
  };

  let userRepository: any;
  let otpRepository: any;
  let jwtService: any;
  let mailClient: any;
  let service: AuthService;

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    otpRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'otp-1', ...value })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = { sign: jest.fn() };
    mailClient = { send: jest.fn().mockReturnValue(of({ delivered: true })) };
    service = new AuthService(
      userRepository,
      otpRepository,
      jwtService,
      mailClient,
    );
  });

  it('never returns the OTP and waits for confirmed mail delivery', async () => {
    const result = await (service as any).generateAndSendOtp(
      'student@example.com',
      'login',
    );

    expect(mailClient.send).toHaveBeenCalledWith(
      { cmd: 'mail.send-otp' },
      expect.objectContaining({
        email: 'student@example.com',
        purpose: 'login',
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
    expect(result).toEqual({
      message: 'Código enviado por correo.',
      retryAfterSeconds: 60,
    });
    expect(result).not.toHaveProperty('otpCode');
  });

  it('removes an unusable OTP and reports failure when mail is not delivered', async () => {
    mailClient.send.mockReturnValue(throwError(() => new Error('Brevo down')));

    await expect(
      (service as any).generateAndSendOtp('student@example.com', 'register'),
    ).rejects.toBeInstanceOf(RpcException);
    expect(otpRepository.delete).toHaveBeenLastCalledWith({ id: 'otp-1' });
  });

  it('validates a recovery OTP without creating a session or consuming it', async () => {
    otpRepository.findOne.mockResolvedValue({
      id: 'otp-1',
      email: 'student@example.com',
      code: '123456',
      purpose: 'recovery',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    });

    const result = await service.verifyOtp({
      email: 'student@example.com',
      code: '123456',
      purpose: 'recovery',
    });

    expect(result).toEqual({
      verified: true,
      message: 'Código de recuperación verificado.',
    });
    expect(otpRepository.remove).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('returns the current database role for every active session check', async () => {
    userRepository.findOne.mockResolvedValue({
      ...verifiedUser,
      role: 'admin',
    });

    await expect(service.validateSession('user-1')).resolves.toEqual({
      active: true,
      user: {
        id: 'user-1',
        email: 'student@example.com',
        role: 'admin',
      },
    });
  });

  it('rejects a banned account even when its access token has not expired', async () => {
    userRepository.findOne.mockResolvedValue({
      ...verifiedUser,
      isBanned: true,
      suspensionReason: 'Abuso',
    });

    await expect(service.validateSession('user-1')).resolves.toEqual({
      active: false,
      message: 'Cuenta suspendida permanentemente: Abuso',
    });
  });
});
