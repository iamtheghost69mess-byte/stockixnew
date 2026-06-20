import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { InternalModule } from '@/modules/Internal/Internal.module';
import { SystemDBModule } from '@/modules/System/SystemDB/SystemDB.module';
import { AttachUserToTenantService } from '@/modules/Internal/commands/AttachUserToTenant.service';
import { SwitchTenantService } from '@/modules/Auth/commands/SwitchTenant.service';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenantModel } from '@/modules/System/models/TenantModel';
import UserTenant from '@/modules/System/models/UserTenant';
import {
  createSystemSqliteKnex,
  destroyKnexInstances,
  migrateSystemSchema,
  seedSystemDb,
} from './tenancy-db.harness';

describe('attach-user-to-tenant integration', () => {
  let systemKnex: ReturnType<typeof createSystemSqliteKnex>;
  let attachService: AttachUserToTenantService;
  let switchService: SwitchTenantService;
  let systemUserModel: typeof SystemUser;
  let tenantModel: typeof TenantModel;
  let userTenantModel: typeof UserTenant;

  beforeAll(async () => {
    systemKnex = createSystemSqliteKnex();
    await migrateSystemSchema(systemKnex);
    
    // Seed basic tenants
    await systemKnex('tenants').insert([
      { id: 100, organization_id: 'org-test-1' },
      { id: 200, organization_id: 'org-test-2' },
    ]);
    
    // Seed user
    await systemKnex('users').insert([
      { id: 50, email: 'admin@integration.com', tenant_id: 100 },
    ]);

    // Give user access to org-test-1 only
    await systemKnex('user_tenants').insert([
      { user_id: 50, tenant_id: 100, organization_id: 'org-test-1' },
    ]);

    systemUserModel = SystemUser.bindKnex(systemKnex);
    tenantModel = TenantModel.bindKnex(systemKnex);
    userTenantModel = UserTenant.bindKnex(systemKnex);

    const clsSetMock = jest.fn();
    const clsGetMock = jest.fn((key: string) => {
      if (key === 'userId') return 50;
      return undefined;
    });

    const mockAuthSigninService = {
      signToken: jest.fn().mockResolvedValue('switch-jwt-token'),
    };

    attachService = new AttachUserToTenantService(
      systemUserModel,
      tenantModel,
      userTenantModel,
    );

    switchService = new SwitchTenantService(
      { get: clsGetMock, set: clsSetMock } as any,
      mockAuthSigninService as any,
      userTenantModel,
      systemUserModel,
      tenantModel,
    );
  });

  afterAll(async () => {
    await destroyKnexInstances(systemKnex);
  });

  it('allows attachUser to grant access to org-test-2', async () => {
    // Act
    await attachService.attachUser({
      email: 'admin@integration.com',
      organizationId: 'org-test-2',
    });

    // Verify DB
    const memberships = await userTenantModel.query().where({ userId: 50 });
    expect(memberships).toHaveLength(2);
    expect(memberships.map((m) => m.organizationId)).toContain('org-test-2');
  });

  it('allows switchTenant to succeed on the newly attached org', async () => {
    // The user context via CLS is userId=50. They try to switch to org-test-2.
    // If the attach was successful, switchTenant will find the membership and succeed.
    const result = await switchService.switchTenant('org-test-2');

    expect(result).toBeDefined();
    expect(result.organizationId).toBe('org-test-2');
    expect(result.tenantId).toBe(200);
    expect(result.accessToken).toBe('switch-jwt-token');
  });

  it('is idempotent on double-completion (does not duplicate row)', async () => {
    await attachService.attachUser({
      email: 'admin@integration.com',
      organizationId: 'org-test-2',
    });

    // Verify DB
    const memberships = await userTenantModel.query().where({ userId: 50, organizationId: 'org-test-2' });
    expect(memberships).toHaveLength(1); // Should only have one despite two calls
  });
});
