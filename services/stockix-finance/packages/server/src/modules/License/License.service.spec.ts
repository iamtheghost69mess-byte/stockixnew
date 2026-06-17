import { HttpStatus } from '@nestjs/common';
import { LicenseService } from './License.service';

describe('LicenseService.assertCanCreateOrganization', () => {
  const buildService = (orgCount: number, maxOrganizations: number) => {
    // Fluent mock: supports leftJoin().where().countDistinct().first() chain
    const makeChainable = (leaf: () => Promise<unknown>) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.leftJoin = self;
      chain.where = self;
      chain.countDistinct = self;
      chain.orderBy = self;
      chain.first = leaf;
      return chain;
    };
    const tenantModel = {
      query: () => makeChainable(async () => ({ count: orgCount })),
    };
    const tenantLicenseModel = {
      query: () => ({
        orderBy: () => ({
          first: async () => ({ maxOrganizations }),
        }),
      }),
    };
    return new LicenseService(
      tenantLicenseModel as never,
      tenantModel as never,
    );
  };

  it('throws ORGANIZATION_LIMIT_REACHED when at limit', async () => {
    const service = buildService(2, 2);
    await expect(service.assertCanCreateOrganization()).rejects.toMatchObject({
      errorType: 'ORGANIZATION_LIMIT_REACHED',
      httpStatus: HttpStatus.PAYMENT_REQUIRED,
    });
  });

  it('allows creation when under limit', async () => {
    const service = buildService(1, 2);
    await expect(service.assertCanCreateOrganization()).resolves.toBeUndefined();
  });

  it('blocks 4th org when maxOrganizations is 3', async () => {
    const service = buildService(3, 3);
    await expect(service.assertCanCreateOrganization()).rejects.toMatchObject({
      errorType: 'ORGANIZATION_LIMIT_REACHED',
      httpStatus: HttpStatus.PAYMENT_REQUIRED,
    });
  });

  it('allows unlimited organizations when maxOrganizations is -1', async () => {
    const service = buildService(99, -1);
    await expect(service.assertCanCreateOrganization()).resolves.toBeUndefined();
  });
});
