import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { RolesService } from '../../../../src/modules/iam/application/roles.service';

describe('RolesService', () => {
  it('locks a role before checking assignments and deleting it', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'role-1' }]),
      role: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'role-1',
          isSystem: false,
          _count: { userRoles: 0 },
          rolePermissions: [],
        }),
        delete: jest.fn().mockResolvedValue({ id: 'role-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PlatformPrismaService;

    await expect(new RolesService(prisma).delete('role-1')).resolves.toEqual({
      deleted: true,
    });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.role.findUnique.mock.invocationCallOrder[0],
    );
    expect(transaction.role.delete).toHaveBeenCalledWith({
      where: { id: 'role-1' },
    });
  });
});
