import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';

describe('tenant isolation — TenancyContext', () => {
  const systemUserModel = { query: jest.fn() };
  const systemTenantModel = {
    query: jest.fn(() => ({
      findOne: jest.fn(),
      withGraphFetched: jest.fn().mockReturnThis(),
    })),
  };

  it('rejects requests without organization-id in CLS', () => {
    const cls = {
      get: jest.fn((key: string) => (key === 'organizationId' ? undefined : undefined)),
    };

    const tenancyContext = new TenancyContext(
      cls as never,
      systemUserModel as never,
      systemTenantModel as never,
    );

    expect(() => tenancyContext.getTenant()).toThrow('Tenant not found');
  });

  it('scopes tenant lookup to organizationId from CLS', () => {
    const findOne = jest.fn().mockReturnValue({ withGraphFetched: jest.fn().mockReturnThis() });
    systemTenantModel.query.mockReturnValue({ findOne });

    const cls = {
      get: jest.fn((key: string) =>
        key === 'organizationId' ? 'org-abc-123' : undefined,
      ),
    };

    const tenancyContext = new TenancyContext(
      cls as never,
      systemUserModel as never,
      systemTenantModel as never,
    );

    tenancyContext.getTenant();
    expect(findOne).toHaveBeenCalledWith({ organizationId: 'org-abc-123' });
  });
});
