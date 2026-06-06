let registered = false;

/** Register ts-node only for tenant seed .ts files (not at server boot — saves ~300MB heap). */
export function ensureSeedTsRuntime(): void {
  if (registered) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('ts-node/register/transpile-only');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('tsconfig-paths/register');
  registered = true;
}
