import { SystemAdminService } from './system-admin.service';

describe('SystemAdminService', () => {
  it('combines database integrity, runtime and integration status without secrets', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { sizeBytes: '10485760', connections: 4, name: 'railway' },
        ])
        .mockResolvedValueOnce([
          { key: 'users', value: 28 },
          { key: 'simulators', value: 6 },
        ])
        .mockResolvedValueOnce([
          {
            orphanOptions: 220,
            invalidSimulators: 0,
            inactiveSimulators: 0,
            unverifiedUniversities: 32,
            failedUniversityEnrichments: 32,
            legacyProfiles: 16,
            unverifiedUsers: 5,
          },
        ]),
    };
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          NODE_ENV: 'production',
          GROQ_API_KEY: 'secret-value',
          GOOGLE_PLACES_API_KEY: 'secret-value',
          INEGI_DENUE_TOKEN: 'secret-value',
          BREVO_API_KEY: 'secret-value',
        };
        return values[key] ?? fallback;
      }),
    };
    const motor = {
      getHealth: jest.fn().mockResolvedValue({
        status: 'operational',
        latencyMs: 42,
        detail: 'Motor A0–A8 disponible',
      }),
    };

    const service = new SystemAdminService(
      dataSource as never,
      config as never,
      motor as never,
    );
    const overview = await service.getOverview();

    expect(overview.database.sizeBytes).toBe(10485760);
    expect(overview.quality.orphanOptions).toBe(220);
    expect(overview.services.find((item) => item.id === 'motor')?.status).toBe(
      'operational',
    );
    expect(overview.services.find((item) => item.id === 'ai')?.status).toBe(
      'configured',
    );
    expect(JSON.stringify(overview)).not.toContain('secret-value');
  });

  it('cleans only operational cache and expired OTP records', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'cache-1' }, { id: 'cache-2' }])
        .mockResolvedValueOnce([{ id: 'otp-1' }]),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    const service = new SystemAdminService(
      dataSource as never,
      { get: jest.fn() } as never,
      { getHealth: jest.fn() } as never,
    );

    await expect(service.clearOperationalCache()).resolves.toEqual({
      universityMatchCacheDeleted: 2,
      expiredOtpCodesDeleted: 1,
    });
    expect(manager.query.mock.calls[0][0]).toContain('university_match_cache');
    expect(manager.query.mock.calls[1][0]).toContain('"expiresAt" < NOW()');
  });
});
