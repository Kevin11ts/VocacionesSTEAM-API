import { UsersService } from './users.service';
import { AlgorithmRun, OtpCode, UniversityMatchCache, User } from '@app/common';

describe('UsersService support tickets', () => {
  it('persists a real attachment and never returns its binary data in the list view', async () => {
    const user = {
      id: 'user-1',
      email: 'student@example.com',
      fullname: 'Student',
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
    } as any;
    const supportRepository = {
      exist: jest.fn().mockResolvedValue(false),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: 'ticket-1',
        createdAt: new Date('2026-07-19T12:00:00Z'),
        updatedAt: new Date('2026-07-19T12:00:00Z'),
        ...value,
      })),
    } as any;
    const service = new UsersService(
      userRepository,
      {} as any,
      {} as any,
      {} as any,
      supportRepository,
    );

    const result = await service.createSupportTicket(
      'user-1',
      {
        category: 'bug',
        subject: 'El mapa no carga',
        message: 'El mapa queda vacío después de conceder ubicación.',
      },
      {
        name: 'captura.png',
        mimeType: 'image/png',
        size: 8,
        dataBase64: Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]).toString('base64'),
      },
    );

    expect(supportRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        attachmentData: Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
      }),
    );
    expect(result.ticket.reference).toMatch(/^SUP-\d{8}-[0-9A-F]{6}$/);
    expect(result.ticket.hasAttachment).toBe(true);
    expect(result.ticket).not.toHaveProperty('attachmentData');
  });

  it('rejects an executable disguised as an image', async () => {
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'student@example.com',
        fullname: 'Student',
      }),
    } as any;
    const supportRepository = {
      exist: jest.fn().mockResolvedValue(false),
    } as any;
    const service = new UsersService(
      userRepository,
      {} as any,
      {} as any,
      {} as any,
      supportRepository,
    );

    await expect(
      service.createSupportTicket(
        'user-1',
        {
          category: 'bug',
          subject: 'Archivo sospechoso',
          message: 'Este archivo declara un tipo que no coincide con su firma.',
        },
        {
          name: 'captura.png',
          mimeType: 'image/png',
          size: 5,
          dataBase64: Buffer.from('MZ...').toString('base64'),
        },
      ),
    ).rejects.toThrow('El contenido del archivo');
  });
});

describe('UsersService account deletion', () => {
  it('deletes non-relational traces before removing the user', async () => {
    const manager = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'google@example.com',
        password: null,
        role: 'student',
      }),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    } as any;
    const service = new UsersService(
      userRepository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.deleteOwnAccount('user-1', 'ELIMINAR'),
    ).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(manager.delete).toHaveBeenNthCalledWith(1, AlgorithmRun, {
      userId: 'user-1',
    });
    expect(manager.delete).toHaveBeenNthCalledWith(2, UniversityMatchCache, {
      userId: 'user-1',
    });
    expect(manager.delete).toHaveBeenNthCalledWith(3, OtpCode, {
      email: 'google@example.com',
    });
    expect(manager.delete).toHaveBeenNthCalledWith(4, User, { id: 'user-1' });
  });

  it('protects the last administrator from self-deletion', async () => {
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'admin-1',
        email: 'admin@example.com',
        password: null,
        role: 'admin',
      }),
      count: jest.fn().mockResolvedValue(1),
      manager: { transaction: jest.fn() },
    } as any;
    const service = new UsersService(
      userRepository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.deleteOwnAccount('admin-1', 'ELIMINAR'),
    ).rejects.toThrow('Debe permanecer al menos un administrador');
    expect(userRepository.manager.transaction).not.toHaveBeenCalled();
  });
});
