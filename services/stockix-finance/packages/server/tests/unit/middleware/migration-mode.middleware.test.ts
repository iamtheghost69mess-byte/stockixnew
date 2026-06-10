import { HttpException } from '@nestjs/common';
import { MigrationModeMiddleware } from '@/common/middleware/migration-mode.middleware';

describe('MigrationModeMiddleware', () => {
  const middleware = new MigrationModeMiddleware();
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MIGRATION_MODE;
  });

  it('allows GET when migration mode is enabled', () => {
    process.env.MIGRATION_MODE = 'true';
    const req = { method: 'GET', path: '/api/bills' } as never;

    middleware.use(req, {} as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks POST when migration mode is enabled', () => {
    process.env.MIGRATION_MODE = 'true';
    const req = { method: 'POST', path: '/api/bills' } as never;

    expect(() => middleware.use(req, {} as never, next)).toThrow(HttpException);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows writes when migration mode is disabled', () => {
    const req = { method: 'POST', path: '/api/bills' } as never;

    middleware.use(req, {} as never, next);
    expect(next).toHaveBeenCalled();
  });
});
