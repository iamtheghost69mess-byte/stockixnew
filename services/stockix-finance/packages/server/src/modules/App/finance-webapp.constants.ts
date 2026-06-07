import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Vite dist copied next to `packages/server/build/` in the Docker image.
 * Webpack output lives under `build/modules/App/` → three levels up to `server/`.
 */
export const FINANCE_WEBAPP_DIST = join(__dirname, '../../../webapp-dist');
export const FINANCE_WEBAPP_INDEX = join(FINANCE_WEBAPP_DIST, 'index.html');

export function isFinanceWebappBuilt(): boolean {
  return existsSync(FINANCE_WEBAPP_INDEX);
}

export function isFinanceWebappApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/')
    || pathname === '/api'
    || pathname.startsWith('/swagger')
    || pathname.startsWith('/public/')
    || pathname === '/public'
    || pathname.startsWith('/socket')
  );
}
