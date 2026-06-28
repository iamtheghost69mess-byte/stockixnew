const fs = require('fs');

const path = 'infra/worker-service/src/provision-runtime.ts';
let code = fs.readFileSync(path, 'utf8');

const headerAndUtils = `
/**
 * ============================================================
 * PROVISIONING STEP EXECUTION CONTRACT — READ BEFORE EDITING
 * ============================================================
 *
 * Every step in this section follows this exact pattern:
 *
 * IDEMPOTENT STEPS (safe to retry):
 *   if (!hasOp('step.name')) {
 *     await withStepTimeout('step.name', TIMEOUT_MS, async () => {
 *       await doTheAction(...);
 *     });
 *     await writeJournal(..., { operationKey: 'step.name' });
 *   }
 *
 * NON-IDEMPOTENT STEPS (pre-marked before action):
 *   if (!hasOp('step.name')) {
 *     await markOpStarted(db, correlationId, 'step.name'); // MUST be first
 *     await withStepTimeout('step.name', TIMEOUT_MS, async () => {
 *       await doTheAction(...);
 *     });
 *     await writeJournal(..., { operationKey: 'step.name' });
 *   }
 *
 * RULES:
 * 1. NEVER add a step without a withStepTimeout wrapper
 * 2. NEVER add a non-idempotent step without markOpStarted FIRST
 * 3. NEVER write to an external API or send email without pre-marking
 * 4. Journal writes (writeJournal) always go AFTER the action
 * 5. markOpStarted always goes BEFORE the action
 * ============================================================
 */
async function markOpStarted(db: PostgresJsDatabase<typeof dbSchema>, correlationId: string, operationKey: string): Promise<void> {
  await db.insert(dbSchema.tenantProvisionEvents).values({
    correlationId,
    phase: "started",
    level: "info",
    message: \`Started \${operationKey}\`,
    meta: { operationKey, status: "started" },
  });
}

async function withStepTimeout<T>(stepName: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(\`step_timeout:\${stepName}:\${timeoutMs}ms\`)), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

  const checkNotCancelled = async () => {`;

code = code.replace('  const checkNotCancelled = async () => {', headerAndUtils);

const stepsToWrapIdempotent = [
  'docker.network_connect',
  'edge.publish',
  'tenant.bootstrap_admin',
  'tenant.fetch_org_settings',
  'tenant.build_organization',
  'tenant.activate_warehouses'
];

const stepsToWrapNonIdempotent = [
  'tenant.complete_setup_wizard',
  'tenant.seed_pos_defaults',
  'add_module.finance_welcome_email'
];

function wrapStep(c, stepName, isNonIdempotent) {
  const opStr1 = `if (!hasOp("${stepName}")) {`;
  let result = c;
  let searchIdx = 0;
  let idx = -1;
  while ((idx = result.indexOf(opStr1, searchIdx)) !== -1) {
    const endMark = `await markOp("${stepName}"`;
    const endIdx = result.indexOf(endMark, idx);
    if (endIdx === -1) {
      searchIdx = idx + opStr1.length;
      continue;
    }
    
    const contentStart = idx + opStr1.length;
    const innerContent = result.substring(contentStart, endIdx);
    
    // If it's already wrapped, skip it (safety check)
    if (innerContent.includes('withStepTimeout')) {
      searchIdx = endIdx + endMark.length;
      continue;
    }

    const prefix = isNonIdempotent ? `\n      await markOpStarted(db, correlationId, "${stepName}");\n      await withStepTimeout("${stepName}", 600000, async () => {` : `\n      await withStepTimeout("${stepName}", 600000, async () => {`;
    
    const replacement = prefix + innerContent + `      });\n      ` + endMark;
    
    result = result.substring(0, contentStart) + replacement + result.substring(endIdx + endMark.length);
    searchIdx = idx + opStr1.length + prefix.length;
  }
  return result;
}

for (const step of stepsToWrapIdempotent) {
  code = wrapStep(code, step, false);
}
for (const step of stepsToWrapNonIdempotent) {
  code = wrapStep(code, step, true);
}

// Special case: In runAddModuleStep the `add_module.finance_welcome_email` is inside a block, its indentation might be slightly different. Let's see if the regex loop handled it.
// Wait! `add_module.accounting_stack` is also a step! But the prompt said "9 previously timeout-less steps".
// I'll wrap `add_module.accounting_stack` as well just in case? The prompt says "All 9 previously timeout-less steps".
// I counted 9. The code loops through 6 idempotent + 3 non-idempotent = 9.

fs.writeFileSync(path, code);
