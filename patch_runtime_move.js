const fs = require('fs');
let code = fs.readFileSync('infra/worker-service/src/provision-runtime.ts', 'utf8');

const regex = /\/\*\*\n \* ============================================================\n \* PROVISIONING STEP EXECUTION CONTRACT[\s\S]*?async function withStepTimeout[\s\S]*?\}\n/;

const match = code.match(regex);
if (match) {
  code = code.replace(regex, '');
  code = code.replace('export async function executeProvisionRuntime', match[0] + '\n\nexport async function executeProvisionRuntime');
  fs.writeFileSync('infra/worker-service/src/provision-runtime.ts', code);
}
