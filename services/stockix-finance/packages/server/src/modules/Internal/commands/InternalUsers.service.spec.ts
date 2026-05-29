import { HttpStatus } from '@nestjs/common';
import { ServiceError } from '@/modules/Items/ServiceError';
import { InternalUsersService } from './InternalUsers.service';

describe('InternalUsersService.sendInvite', () => {
  const tenantId = 1;
  const tenant = { id: tenantId, organizationId: 'org-1' };

  const buildService = (userCount: number, maxUsers: number) => {
    const tenantKnex = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue([99]),
      update: jest.fn().mockResolvedValue(1),
    });

    return new InternalUsersService(
      { query: jest.fn() } as never,
      {
        query: () => ({
          findById: jest.fn().mockResolvedValue(tenant),
        }),
      } as never,
      {
        query: () => ({
          where: () => ({
            count: () => ({
              first: async () => ({ count: userCount }),
            }),
          }),
        }),
      } as never,
      {
        query: () => ({
          findOne: jest.fn().mockResolvedValue({ maxUsers }),
        }),
      } as never,
      { query: jest.fn() } as never,
      {
        getKnexForTenantId: jest.fn().mockResolvedValue(tenantKnex()),
      } as never,
      { emitAsync: jest.fn() } as never,
    );
  };

  it('throws USER_LIMIT_REACHED when at maxUsers', async () => {
    const service = buildService(5, 5);
    await expect(
      service.sendInvite(tenantId, { email: 'new@example.com', roleId: 1 }),
    ).rejects.toMatchObject({
      errorType: 'USER_LIMIT_REACHED',
      httpStatus: HttpStatus.PAYMENT_REQUIRED,
    });
  });
});
