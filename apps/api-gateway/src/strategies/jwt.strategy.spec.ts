import { UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy live account validation', () => {
  const config = { get: jest.fn().mockReturnValue('test-secret') } as any;

  it('uses the current principal returned by Auth instead of the stale JWT role', async () => {
    const authClient = {
      send: jest.fn().mockReturnValue(
        of({
          active: true,
          user: { id: 'u1', email: 'u@example.com', role: 'student' },
        }),
      ),
    } as any;
    const strategy = new JwtStrategy(config, authClient);

    await expect(
      strategy.validate({ sub: 'u1', email: 'u@example.com', role: 'admin' }),
    ).resolves.toEqual({
      id: 'u1',
      email: 'u@example.com',
      role: 'student',
    });
  });

  it('fails closed when the account was suspended', async () => {
    const authClient = {
      send: jest
        .fn()
        .mockReturnValue(of({ active: false, message: 'Cuenta suspendida.' })),
    } as any;
    const strategy = new JwtStrategy(config, authClient);

    await expect(strategy.validate({ sub: 'u1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
