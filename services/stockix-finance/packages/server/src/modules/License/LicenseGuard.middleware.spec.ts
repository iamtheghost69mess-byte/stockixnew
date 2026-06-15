import { HttpStatus } from '@nestjs/common';
import { LicenseGuardMiddleware } from './LicenseGuard.middleware';
import { licenseCache } from './LicenseGuard.cache';

describe('LicenseGuardMiddleware', () => {
  beforeEach(() => {
    licenseCache.clear();
  });

  function buildMiddleware(effectiveStatus: string | null) {
    const licenseService = {
      findByTenantId: jest.fn().mockResolvedValue(
        effectiveStatus
          ? { status: effectiveStatus, isPerpetual: false, expiresAt: null, gracePeriodDays: 7 }
          : undefined,
      ),
      resolveEffectiveStatus: jest.fn().mockReturnValue(effectiveStatus),
    };
    const tenantModel = {
      query: () => ({
        findOne: jest.fn().mockResolvedValue({ id: 1, organizationId: 'org-1' }),
      }),
    };
    const clsService = { get: jest.fn().mockReturnValue('org-1') };
    return new LicenseGuardMiddleware(
      clsService as never,
      licenseService as never,
      tenantModel as never,
    );
  }

  it('blocks writes when no license row exists', async () => {
    const middleware = buildMiddleware(null);
    const req = {
      originalUrl: '/api/items',
      method: 'POST',
      headers: { 'organization-id': 'org-1' },
    } as never;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware.use(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'LICENSE_NOT_CONFIGURED' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows reads when no license row exists', async () => {
    const middleware = buildMiddleware(null);
    const req = {
      originalUrl: '/api/items',
      method: 'GET',
      headers: { 'organization-id': 'org-1' },
    } as never;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await middleware.use(req, res as never, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows reads when license is expired', async () => {
    const middleware = buildMiddleware('expired');
    const req = {
      originalUrl: '/api/items',
      method: 'GET',
      headers: { 'organization-id': 'org-1' },
    } as never;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await middleware.use(req, res as never, next);

    expect(next).toHaveBeenCalled();
  });

  it('blocks writes when license is expired', async () => {
    const middleware = buildMiddleware('expired');
    const req = {
      originalUrl: '/api/items',
      method: 'POST',
      headers: { 'organization-id': 'org-1' },
    } as never;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware.use(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'LICENSE_EXPIRED' }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
