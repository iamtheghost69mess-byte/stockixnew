import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenancyGlobalGuard } from '@/modules/Tenancy/TenancyGlobal.guard';
import { AuthSigninService } from '@/modules/Auth/commands/AuthSignin.service';
import { SwitchTenantService } from '@/modules/Auth/commands/SwitchTenant.service';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { Customer } from '@/modules/Customers/models/Customer';
import {
  createSystemSqliteKnex,
  createTenantSqliteKnex,
  createTenancyKnexProxy,
  destroyKnexInstances,
  migrateSystemSchema,
  migrateTenantSchema,
  seedSystemDb,
  seedTenantContact,
} from './tenancy-db.harness';

function mockExecutionContext(headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('cross-tenant isolation', () => {
  let systemKnex: ReturnType<typeof createSystemSqliteKnex>;
  let userTenantModel: typeof UserTenant;
  let tenantModel: typeof TenantModel;
  let systemUserModel: typeof SystemUser;

  beforeAll(async () => {
    systemKnex = createSystemSqliteKnex();
    await migrateSystemSchema(systemKnex);
    await seedSystemDb(systemKnex);

    userTenantModel = UserTenant.bindKnex(systemKnex);
    tenantModel = TenantModel.bindKnex(systemKnex);
    systemUserModel = SystemUser.bindKnex(systemKnex);
  });

  afterAll(async () => {
    await destroyKnexInstances(systemKnex);
  });

  describe('TenancyGlobalGuard', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => false),
    } as unknown as Reflector;

    const clsSet = jest.fn();
    const clsGet = jest.fn();
    let guard: TenancyGlobalGuard;

    beforeEach(() => {
      guard = new TenancyGlobalGuard(
        reflector,
        { get: clsGet, set: clsSet } as any,
        userTenantModel,
        tenantModel,
      );
      jest.clearAllMocks();
      clsGet.mockImplementation((key: string) => {
        if (key === 'userId') return 42;
        if (key === 'organizationId') return 'org-a';
        return undefined;
      });
    });

    it('sets tenantId in CLS after membership check', async () => {
      const ok = await guard.canActivate(
        mockExecutionContext({ 'organization-id': 'org-a', authorization: 'Bearer token' }),
      );

      expect(ok).toBe(true);
      expect(clsSet).toHaveBeenCalledWith('tenantId', 7);
      expect(clsSet).toHaveBeenCalledWith('organizationId', 'org-a');
    });

    it('rejects when user is not a member of the organization', async () => {
      await expect(
        guard.canActivate(
          mockExecutionContext({ 'organization-id': 'org-unknown', authorization: 'Bearer token' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when organization-id header is missing', async () => {
      await expect(
        guard.canActivate(mockExecutionContext({ authorization: 'Bearer token' })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('AuthSigninService.verifyPayload', () => {
    it('resolves tenantId from JWT organizationId, not user.tenantId', async () => {
      const clsSet = jest.fn();

      const service = new AuthSigninService(
        systemUserModel,
        userTenantModel,
        tenantModel,
        { sign: jest.fn() } as any,
        { set: clsSet } as any,
      );

      await service.verifyPayload({ sub: 'user@example.com', organizationId: 'org-b' });

      expect(clsSet).toHaveBeenCalledWith('userId', 42);
      expect(clsSet).toHaveBeenCalledWith('organizationId', 'org-b');
      expect(clsSet).toHaveBeenCalledWith('tenantId', 5);
      expect(clsSet).not.toHaveBeenCalledWith('tenantId', 99);
    });
  });

  describe('SwitchTenantService', () => {
    it('updates CLS with the switched tenant', async () => {
      const clsGet = jest.fn((key: string) => (key === 'userId' ? 42 : undefined));
      const clsSet = jest.fn();

      const authSigninService = {
        signToken: jest.fn().mockResolvedValue('new-token'),
      };

      const service = new SwitchTenantService(
        { get: clsGet, set: clsSet } as any,
        authSigninService as any,
        userTenantModel,
        systemUserModel,
        tenantModel,
      );

      const result = await service.switchTenant('org-c');

      expect(clsSet).toHaveBeenCalledWith('tenantId', 12);
      expect(clsSet).toHaveBeenCalledWith('organizationId', 'org-c');
      expect(result).toEqual({
        accessToken: 'new-token',
        organizationId: 'org-c',
        tenantId: 12,
        userId: 42,
      });
    });
  });

  describe('TenancyDB database-per-tenant', () => {
    let tenantKnexA: ReturnType<typeof createTenantSqliteKnex>;
    let tenantKnexB: ReturnType<typeof createTenantSqliteKnex>;
    let clsOrgId: string | undefined;
    let tenantKnexProxy: ReturnType<typeof createTenancyKnexProxy>;

    beforeAll(async () => {
      tenantKnexA = createTenantSqliteKnex();
      tenantKnexB = createTenantSqliteKnex();
      await migrateTenantSchema(tenantKnexA);
      await migrateTenantSchema(tenantKnexB);
      await seedTenantContact(tenantKnexA, 'A Corp');
      await seedTenantContact(tenantKnexB, 'B Corp');

      const dbsByOrg = new Map([
        ['org-a', tenantKnexA],
        ['org-b', tenantKnexB],
      ]);
      clsOrgId = 'org-a';
      tenantKnexProxy = createTenancyKnexProxy(dbsByOrg, () => clsOrgId);
    });

    afterAll(async () => {
      await destroyKnexInstances(tenantKnexA, tenantKnexB);
    });

    it('returns org-a customer when CLS organizationId is org-a', async () => {
      clsOrgId = 'org-a';
      const CustomerModel = Customer.bindKnex(tenantKnexProxy());
      const row = await CustomerModel.query().findById(1);

      expect(row?.displayName).toBe('A Corp');
    });

    it('returns org-b customer when CLS organizationId is org-b', async () => {
      clsOrgId = 'org-b';
      const CustomerModel = Customer.bindKnex(tenantKnexProxy());
      const row = await CustomerModel.query().findById(1);

      expect(row?.displayName).toBe('B Corp');
    });

    it('does not leak org-b data when querying under org-a context', async () => {
      clsOrgId = 'org-a';
      const CustomerModel = Customer.bindKnex(tenantKnexProxy());
      const rows = await CustomerModel.query().where('displayName', 'B Corp');

      expect(rows).toHaveLength(0);
    });
  });
});
