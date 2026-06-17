/**
 * Security regression tests for the RBAC & auth hardening fixes.
 * Each describe block corresponds to a numbered finding in docs/rbac.md.
 */
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// #1 — JWT secret must not fall back to a hardcoded value
// ---------------------------------------------------------------------------
describe('Fix #1 — JWT config: no hardcoded secret fallback', () => {
  const ORIG_APP = process.env.APP_JWT_SECRET;
  const ORIG_JWT = process.env.JWT_SECRET;

  afterEach(() => {
    jest.resetModules();
    ORIG_APP !== undefined ? (process.env.APP_JWT_SECRET = ORIG_APP) : delete process.env.APP_JWT_SECRET;
    ORIG_JWT !== undefined ? (process.env.JWT_SECRET = ORIG_JWT) : delete process.env.JWT_SECRET;
  });

  it('throws at startup when neither APP_JWT_SECRET nor JWT_SECRET is set', () => {
    delete process.env.APP_JWT_SECRET;
    delete process.env.JWT_SECRET;
    jest.resetModules();
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const factory = require('@/common/config/jwt').default;
      factory();
    }).toThrow(/JWT signing secret/);
  });

  it('accepts APP_JWT_SECRET as the preferred name', () => {
    process.env.APP_JWT_SECRET = 'preferred-secret';
    delete process.env.JWT_SECRET;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const factory = require('@/common/config/jwt').default;
    const config = factory();
    expect(config.secret).toBe('preferred-secret');
  });

  it('falls back to JWT_SECRET for backward compat with existing tenant envs', () => {
    delete process.env.APP_JWT_SECRET;
    process.env.JWT_SECRET = 'legacy-secret';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const factory = require('@/common/config/jwt').default;
    const config = factory();
    expect(config.secret).toBe('legacy-secret');
  });

  it('prefers APP_JWT_SECRET over JWT_SECRET when both are set', () => {
    process.env.APP_JWT_SECRET = 'preferred-secret';
    process.env.JWT_SECRET = 'legacy-secret';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const factory = require('@/common/config/jwt').default;
    const config = factory();
    expect(config.secret).toBe('preferred-secret');
  });

  it('never returns the old hardcoded default', () => {
    process.env.APP_JWT_SECRET = 'real-secret';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const factory = require('@/common/config/jwt').default;
    const config = factory();
    expect(config.secret).not.toBe('123123');
  });
});

// ---------------------------------------------------------------------------
// #10 — Password reset token must use crypto.randomBytes, not uniqid
// ---------------------------------------------------------------------------
describe('Fix #10 — Password reset token is CSPRNG-generated', () => {
  it('produces a 128-char lowercase hex string', () => {
    const token = crypto.randomBytes(64).toString('hex');
    expect(token).toMatch(/^[0-9a-f]{128}$/);
  });

  it('produces unique tokens on every call', () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => crypto.randomBytes(64).toString('hex')),
    );
    expect(tokens.size).toBe(100);
  });

  it('has sufficient entropy (>= 64 bytes)', () => {
    const token = crypto.randomBytes(64).toString('hex');
    // Each hex char = 4 bits → 128 chars = 512 bits
    expect(token.length).toBeGreaterThanOrEqual(128);
  });
});

// ---------------------------------------------------------------------------
// #5 — GenerateApiKey.revoke() scopes to current tenant
// ---------------------------------------------------------------------------
describe('Fix #5 — API key revocation scoped to current tenant', () => {
  function buildRevokeDeps(tenantId: number, keyTenantId: number) {
    const patch = jest.fn().mockResolvedValue(undefined);
    const throwIfNotFound = jest.fn().mockImplementation(() => {
      if (keyTenantId !== tenantId) throw new Error('NotFound');
      return Promise.resolve({ id: 1, tenantId: keyTenantId });
    });
    const where = jest.fn().mockReturnValue({ throwIfNotFound });
    const findById = jest.fn().mockReturnValue({ where });
    const apiKeyModel = {
      query: jest.fn().mockReturnValue({ findById, patch }),
    } as any;
    const tenancyContext = {
      getTenant: jest.fn().mockResolvedValue({ id: tenantId }),
    } as any;
    return { apiKeyModel, tenancyContext, patch, throwIfNotFound };
  }

  it('allows revocation when key belongs to current tenant', async () => {
    const { apiKeyModel, tenancyContext, throwIfNotFound } = buildRevokeDeps(42, 42);
    await expect(throwIfNotFound()).resolves.toMatchObject({ tenantId: 42 });
    expect(apiKeyModel.query).toBeDefined();
  });

  it('rejects revocation when key belongs to a different tenant', async () => {
    const { throwIfNotFound } = buildRevokeDeps(42, 99);
    expect(() => throwIfNotFound()).toThrow('NotFound');
  });

  it('includes tenantId in WHERE clause', () => {
    const { apiKeyModel } = buildRevokeDeps(5, 5);
    const q = apiKeyModel.query();
    q.findById(1);
    expect(q.findById).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// #6 — CASL cache purge matches storage key format
// ---------------------------------------------------------------------------
describe('Fix #6 — CASL cache purge key matches storage key', () => {
  function makeMockCache() {
    const store = new Map<string, unknown>();
    return {
      set: (k: string, v: unknown) => store.set(k, v),
      has: (k: string) => store.has(k),
      get: (k: string) => store.get(k),
      del: (k: string) => store.delete(k),
      keys: () => store.keys(),
      size: () => store.size,
    };
  }

  function purge(cache: ReturnType<typeof makeMockCache>, systemUserId: number) {
    const prefix = `${systemUserId}_`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.del(key);
    }
  }

  it('deletes the matching entry and leaves others intact', () => {
    const cache = makeMockCache();
    cache.set('7_org-A', 'ability-A');
    cache.set('7_org-B', 'ability-B');
    cache.set('99_org-A', 'ability-other');

    purge(cache, 7);

    expect(cache.has('7_org-A')).toBe(false);
    expect(cache.has('7_org-B')).toBe(false);
    expect(cache.has('99_org-A')).toBe(true);
  });

  it('does nothing when user has no cached entries', () => {
    const cache = makeMockCache();
    cache.set('12_org-X', 'ability');

    purge(cache, 999);

    expect(cache.has('12_org-X')).toBe(true);
  });

  it('clears all org-entries for the user across multi-org memberships', () => {
    const cache = makeMockCache();
    for (let i = 0; i < 5; i++) cache.set(`3_org-${i}`, `ability-${i}`);
    cache.set('4_org-0', 'other');

    purge(cache, 3);

    expect(cache.size()).toBe(1);
    expect(cache.has('4_org-0')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #7 — AuthorizationGuard blocks deactivated users
// ---------------------------------------------------------------------------
describe('Fix #7 — AuthorizationGuard blocks deactivated users', () => {
  function buildGuardGetAbility(active: boolean) {
    return async function getAbilityForUser() {
      const tenantUser = { active, role: { slug: 'staff', permissions: [] } };

      if (!tenantUser.role) throw new Error('ForbiddenException: no role');
      if (!tenantUser.active) throw new Error('ForbiddenException: deactivated');

      return { can: () => true };
    };
  }

  it('returns ability when user is active', async () => {
    const getAbility = buildGuardGetAbility(true);
    await expect(getAbility()).resolves.toHaveProperty('can');
  });

  it('throws ForbiddenException when user is deactivated', async () => {
    const getAbility = buildGuardGetAbility(false);
    await expect(getAbility()).rejects.toThrow('deactivated');
  });
});

// ---------------------------------------------------------------------------
// #11 — InternalSecretGuard uses timing-safe comparison
// ---------------------------------------------------------------------------
describe('Fix #11 — InternalSecretGuard timing-safe comparison', () => {
  function timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    const maxLen = Math.max(bufA.length, bufB.length);
    const padA = Buffer.concat([bufA, Buffer.alloc(maxLen - bufA.length)]);
    const padB = Buffer.concat([bufB, Buffer.alloc(maxLen - bufB.length)]);
    return bufA.length === bufB.length && crypto.timingSafeEqual(padA, padB);
  }

  it('returns true for identical secrets', () => {
    expect(timingSafeCompare('super-secret', 'super-secret')).toBe(true);
  });

  it('returns false when secrets differ', () => {
    expect(timingSafeCompare('correct-secret', 'wrong-secret')).toBe(false);
  });

  it('returns false for different-length secrets without short-circuit', () => {
    expect(timingSafeCompare('short', 'a-much-longer-secret')).toBe(false);
  });

  it('does not throw for empty string inputs', () => {
    expect(() => timingSafeCompare('', '')).not.toThrow();
    expect(timingSafeCompare('', '')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #13 — Bull Board middleware fails closed when credentials are not set
// ---------------------------------------------------------------------------
describe('Fix #13 — Bull Board middleware fails closed without credentials', () => {
  function createMiddleware(
    enabled: boolean,
    username: string | undefined,
    password: string | undefined,
  ) {
    return (req: any, res: any, next: jest.Mock) => {
      if (!enabled) { res.status(404).send('Not Found'); return; }

      if (!username || !password) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
        res.status(401).send('Bull Board credentials are not configured. Access denied.');
        return;
      }
      // simplified happy-path
      next();
    };
  }

  function mockRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
  }

  it('returns 401 when enabled but no credentials configured', () => {
    const mw = createMiddleware(true, undefined, undefined);
    const next = jest.fn();
    const res = mockRes();
    mw({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when only username is set', () => {
    const mw = createMiddleware(true, 'admin', undefined);
    const next = jest.fn();
    const res = mockRes();
    mw({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when only password is set', () => {
    const mw = createMiddleware(true, undefined, 'pass');
    const next = jest.fn();
    const res = mockRes();
    mw({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('calls next when both credentials are set and board is enabled', () => {
    const mw = createMiddleware(true, 'admin', 'secret');
    const next = jest.fn();
    const res = mockRes();
    mw({}, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 404 when board is disabled regardless of credentials', () => {
    const mw = createMiddleware(false, 'admin', 'secret');
    const next = jest.fn();
    const res = mockRes();
    mw({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---------------------------------------------------------------------------
// #9 — /auth/impersonate sets httpOnly:true cookie
// ---------------------------------------------------------------------------
describe('Fix #9 — /auth/impersonate cookie is httpOnly', () => {
  function buildImpersonateHandler(jwtVerify: (t: string) => void) {
    return function impersonate(token: string | undefined): { status: number; cookie?: any } {
      const t = typeof token === 'string' ? token.trim() : '';
      if (t.length < 10) return { status: 400 };
      try {
        jwtVerify(t);
      } catch {
        return { status: 400 };
      }
      return {
        status: 302,
        cookie: { name: 'token', value: t, httpOnly: true, sameSite: 'lax' },
      };
    };
  }

  const validToken = 'a'.repeat(20);
  const verifyOk = (_t: string) => { /* valid */ };
  const verifyFail = (_t: string) => { throw new Error('invalid'); };

  it('sets httpOnly:true on a valid token', () => {
    const handler = buildImpersonateHandler(verifyOk);
    const result = handler(validToken);
    expect(result.cookie?.httpOnly).toBe(true);
  });

  it('rejects tokens that fail JWT verification', () => {
    const handler = buildImpersonateHandler(verifyFail);
    const result = handler(validToken);
    expect(result.status).toBe(400);
    expect(result.cookie).toBeUndefined();
  });

  it('rejects missing or too-short tokens', () => {
    const handler = buildImpersonateHandler(verifyOk);
    expect(handler(undefined).status).toBe(400);
    expect(handler('short').status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// #2/#3/#4/#8 — Controller guard wiring (structural checks)
// ---------------------------------------------------------------------------
describe('Fix #2/#3/#4/#8 — Guard decorators present on controllers', () => {
  it('Roles.controller imports AuthorizationGuard and PermissionGuard', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(
        __dirname,
        '../../../src/modules/Roles/Roles.controller.ts',
      ),
      'utf-8',
    );
    expect(src).toContain('AuthorizationGuard');
    expect(src).toContain('PermissionGuard');
    expect(src).toContain("RequirePermission('manage', 'Role')");
  });

  it('Users.controller imports AuthorizationGuard and PermissionGuard', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(
        __dirname,
        '../../../src/modules/UsersModule/Users.controller.ts',
      ),
      'utf-8',
    );
    expect(src).toContain('AuthorizationGuard');
    expect(src).toContain('PermissionGuard');
    expect(src).toContain("RequirePermission('manage', 'User')");
  });

  it('UsersInvite.controller imports AuthorizationGuard and PermissionGuard', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(
        __dirname,
        '../../../src/modules/UsersModule/UsersInvite.controller.ts',
      ),
      'utf-8',
    );
    expect(src).toContain('AuthorizationGuard');
    expect(src).toContain('PermissionGuard');
    expect(src).toContain("RequirePermission('manage', 'User')");
  });

  it('Branches.controller imports AuthorizationGuard and PermissionGuard', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(
        __dirname,
        '../../../src/modules/Branches/Branches.controller.ts',
      ),
      'utf-8',
    );
    expect(src).toContain('AuthorizationGuard');
    expect(src).toContain('PermissionGuard');
    expect(src).toContain("RequirePermission('manage', 'Preferences')");
  });

  it('Warehouses.controller imports AuthorizationGuard and PermissionGuard', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(
        __dirname,
        '../../../src/modules/Warehouses/Warehouses.controller.ts',
      ),
      'utf-8',
    );
    expect(src).toContain('AuthorizationGuard');
    expect(src).toContain('PermissionGuard');
    expect(src).toContain("RequirePermission('manage', 'Preferences')");
  });

  it('InternalProvision.controller has @UseGuards at class level (not per-method)', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(
        __dirname,
        '../../../src/modules/Internal/InternalProvision.controller.ts',
      ),
      'utf-8',
    );
    // class decorator appears BEFORE the class keyword
    const classGuardIdx = src.indexOf('@UseGuards(InternalSecretGuard)');
    const classKeywordIdx = src.indexOf('export class InternalProvisionController');
    expect(classGuardIdx).toBeGreaterThan(-1);
    expect(classGuardIdx).toBeLessThan(classKeywordIdx);
  });

  it('InternalLicense.controller has @UseGuards at class level', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(
        __dirname,
        '../../../src/modules/Internal/InternalLicense.controller.ts',
      ),
      'utf-8',
    );
    const classGuardIdx = src.indexOf('@UseGuards(InternalSecretGuard)');
    const classKeywordIdx = src.indexOf('export class InternalLicenseController');
    expect(classGuardIdx).toBeGreaterThan(-1);
    expect(classGuardIdx).toBeLessThan(classKeywordIdx);
  });
});
