import { UsersService } from './users.service';

describe('UsersService privilege changes', () => {
  it('revokes the refresh token when an administrator role changes', async () => {
    const user = {
      id: 'admin-1',
      email: 'admin@example.com',
      fullname: 'Admin',
      role: 'admin',
      hashedRefreshToken: 'old-refresh-hash',
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      count: jest.fn().mockResolvedValue(2),
      save: jest.fn(async (value) => value),
    } as any;
    const service = new UsersService(
      userRepository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.update('admin-1', { role: 'student' }, 'admin-2');

    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'student', hashedRefreshToken: null }),
    );
  });
});
