import { TestsController } from './tests.controller';

describe('TestsController motor wiring', () => {
  it('routes the PWA profile command to the independent motor', async () => {
    const profileService = { computeProfile: jest.fn() };
    const motorService = {
      computeProfileForApplication: jest
        .fn()
        .mockResolvedValue({ profileVersion: '1.0.0' }),
    };
    const controller = new TestsController(
      {} as never,
      {} as never,
      profileService as never,
      {} as never,
      motorService as never,
      {} as never,
    );
    const request = { theoreticalAnswers: { q1: 'A' } };

    await expect(
      controller.computeProfile({ userId: 'user-1', request }),
    ).resolves.toEqual({ profileVersion: '1.0.0' });
    expect(motorService.computeProfileForApplication).toHaveBeenCalledWith(
      'user-1',
      request,
    );
    expect(profileService.computeProfile).not.toHaveBeenCalled();
  });
});
