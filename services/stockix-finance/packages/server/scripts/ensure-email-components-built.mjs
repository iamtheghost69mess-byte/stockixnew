import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const financeRoot = path.resolve(scriptDir, '../../..');
const typesFile = path.join(
  financeRoot,
  'shared/email-components/dist/main.d.ts',
);

if (!existsSync(typesFile)) {
  execSync('pnpm --filter @stockix/email-components run build', {
    stdio: 'inherit',
    cwd: financeRoot,
  });
}
