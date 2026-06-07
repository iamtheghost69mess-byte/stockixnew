import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Vite dist copied to `packages/server/webapp-dist` in the Docker image.
 * Webpack entry runs from `packages/server/build/index.js` → one level up.
 */
export const FINANCE_WEBAPP_DIST = join(__dirname, '../webapp-dist');
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

/** Built asset paths (manifest, fonts, hashed chunks) must not fall through to SPA index.html. */
export function isFinanceWebappStaticAssetPath(pathname: string): boolean {
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}
