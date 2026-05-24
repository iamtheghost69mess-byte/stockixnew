import { SyncLicenseService } from './SyncLicense.service';
import { LicenseService } from '@/modules/License/License.service';
import { HttpStatus } from '@nestjs/common';

describe('SyncLicenseService', () => {
  it('persists maxOrganizations from provision sync payload', async () => {
    const rows = new Map<number, Record<string, unknown>>();
    const tenantLicenseModel = {
      query: () => ({
        findOne: async ({ tenantId }: { tenantId: number }) =>
          rows.get(tenantId) ?? undefined,
        patch: async (payload: Record<string, unknown>) => ({
          where: async ({ tenantId }: { tenantId: number }) => {
            rows.set(tenantId, { ...rows.get(tenantId), ...payload });
          },
        }),
        insert: async (payload: Record<string, unknown>) => {
          rows.set(Number(payload.tenantId), payload);
        },
      }),
    };

    const service = new SyncLicenseService(tenantLicenseModel as never);
    await service.sync({
      tenantId: 1,
      planSlug: 'growth',
      status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
      gracePeriodDays: 7,
      maxUsers: 999,
      maxActivations: 2,
      maxOrganizations: 3,
      isPerpetual: true,
      featureFlags: null,
    });

    expect(rows.get(1)?.maxOrganizations).toBe(3);
  });
});

describe('LicenseService.assertCanCreateOrganization after sync', () => {
  const buildService = (orgCount: number, maxOrganizations: number) => {
    const tenantModel = {
      query: () => ({
        count: () => ({
          first: async () => ({ count: orgCount }),
        }),
      }),
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

  it('blocks creating a 4th org when maxOrganizations is 3', async () => {
    const service = buildService(3, 3);
    await expect(service.assertCanCreateOrganization()).rejects.toMatchObject({
      errorType: 'ORGANIZATION_LIMIT_REACHED',
      httpStatus: HttpStatus.PAYMENT_REQUIRED,
    });
  });

  it('allows creating a 3rd org when maxOrganizations is 3', async () => {
    const service = buildService(2, 3);
    await expect(service.assertCanCreateOrganization()).resolves.toBeUndefined();
  });
});
