import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenancyGlobalGuard } from '@/modules/Tenancy/TenancyGlobal.guard';
import { AuthSigninService } from '@/modules/Auth/commands/AuthSignin.service';
import { SwitchTenantService } from '@/modules/Auth/commands/SwitchTenant.service';

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
  describe('TenancyGlobalGuard', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => false),
    } as unknown as Reflector;

    const clsSet = jest.fn();
    const clsGet = jest.fn();

    const userTenantModel = {
      query: jest.fn(() => ({
        findOne: jest.fn().mockReturnThis(),
        first: jest.fn(),
      })),
    };

    const tenantModel = {
      query: jest.fn(() => ({
        findOne: jest.fn().mockReturnThis(),
        first: jest.fn(),
      })),
    };

    const guard = new TenancyGlobalGuard(
      reflector,
      { get: clsGet, set: clsSet } as any,
      userTenantModel as any,
      tenantModel as any,
    );

    beforeEach(() => {
      jest.clearAllMocks();
      clsGet.mockImplementation((key: string) => {
        if (key === 'userId') return 42;
        if (key === 'organizationId') return 'org-a';
        return undefined;
      });
    });

    it('sets tenantId in CLS after membership check', async () => {
      const findMembership = jest.fn().mockReturnThis();
      const firstMembership = jest.fn().mockResolvedValue({ userId: 42, organizationId: 'org-a' });
      userTenantModel.query.mockReturnValue({
        findOne: findMembership,
        first: firstMembership,
      });

      const findTenant = jest.fn().mockReturnThis();
      const firstTenant = jest.fn().mockResolvedValue({ id: 7, organizationId: 'org-a' });
      tenantModel.query.mockReturnValue({
        findOne: findTenant,
        first: firstTenant,
      });

      const ok = await guard.canActivate(
        mockExecutionContext({ 'organization-id': 'org-a', authorization: 'Bearer token' }),
      );

      expect(ok).toBe(true);
      expect(findMembership).toHaveBeenCalledWith({ userId: 42, organizationId: 'org-a' });
      expect(findTenant).toHaveBeenCalledWith({ organizationId: 'org-a' });
      expect(clsSet).toHaveBeenCalledWith('tenantId', 7);
      expect(clsSet).toHaveBeenCalledWith('organizationId', 'org-a');
    });

    it('rejects when user is not a member of the organization', async () => {
      userTenantModel.query.mockReturnValue({
        findOne: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      });

      await expect(
        guard.canActivate(
          mockExecutionContext({ 'organization-id': 'org-b', authorization: 'Bearer token' }),
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
      const systemUserModel = {
        query: jest.fn(() => ({
          findOne: jest.fn().mockReturnThis(),
          throwIfNotFound: jest.fn().mockResolvedValue({
            id: 42,
            email: 'user@example.com',
            tenantId: 99,
          }),
        })),
      };
      const userTenantModel = {
        query: jest.fn(() => ({
          findOne: jest.fn().mockReturnThis(),
          throwIfNotFound: jest.fn().mockResolvedValue({ userId: 42, organizationId: 'org-b' }),
        })),
      };
      const tenantModel = {
        query: jest.fn(() => ({
          findOne: jest.fn().mockReturnThis(),
          throwIfNotFound: jest.fn().mockResolvedValue({ id: 5, organizationId: 'org-b' }),
        })),
      };

      const service = new AuthSigninService(
        systemUserModel as any,
        userTenantModel as any,
        tenantModel as any,
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

      const userTenantModel = {
        query: jest.fn(() => ({
          findOne: jest.fn().mockReturnThis(),
          throwIfNotFound: jest.fn().mockResolvedValue({ userId: 42, organizationId: 'org-c' }),
        })),
      };
      const systemUserModel = {
        query: jest.fn(() => ({
          findById: jest.fn().mockReturnThis(),
          throwIfNotFound: jest.fn().mockResolvedValue({ id: 42, email: 'user@example.com' }),
        })),
      };
      const tenantModel = {
        query: jest.fn(() => ({
          findOne: jest.fn().mockReturnThis(),
          throwIfNotFound: jest.fn().mockResolvedValue({ id: 12, organizationId: 'org-c' }),
        })),
      };
      const authSigninService = {
        signToken: jest.fn().mockResolvedValue('new-token'),
      };

      const service = new SwitchTenantService(
        { get: clsGet, set: clsSet } as any,
        authSigninService as any,
        userTenantModel as any,
        systemUserModel as any,
        tenantModel as any,
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
});
