const fs = require('fs');
let code = fs.readFileSync('infra/worker-service/src/provision-runtime.ts', 'utf8');

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

function findClosingBrace(str, startIdx) {
  let depth = 0;
  let inString = false;
  let stringChar = null;
  let inComment = false;
  let inMultilineComment = false;

  for (let i = startIdx; i < str.length; i++) {
    const c = str[i];
    const nextC = str[i+1];

    if (inMultilineComment) {
      if (c === '*' && nextC === '/') {
        inMultilineComment = false;
        i++;
      }
      continue;
    }
    if (inComment) {
      if (c === '\n') inComment = false;
      continue;
    }
    if (inString) {
      if (c === '\\' ) { i++; continue; }
      if (c === stringChar) { inString = false; }
      continue;
    }

    if (c === '/' && nextC === '/') {
      inComment = true;
      i++;
      continue;
    }
    if (c === '/' && nextC === '*') {
      inMultilineComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      stringChar = c;
      continue;
    }

    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function wrapStep(c, stepName, isNonIdempotent) {
  const opStr1 = `if (!hasOp("${stepName}")) {`;
  const opStr2 = `if (!hasOp('${stepName}')) {`;

  let result = c;
  let searchIdx = 0;
  let idx = -1;
  while (true) {
    let idx1 = result.indexOf(opStr1, searchIdx);
    let idx2 = result.indexOf(opStr2, searchIdx);
    if (idx1 === -1 && idx2 === -1) break;
    
    idx = idx1 !== -1 ? idx1 : idx2;
    const opStr = idx1 !== -1 ? opStr1 : opStr2;

    const blockStartIdx = idx + opStr.length - 1; // points to '{'
    const blockEndIdx = findClosingBrace(result, blockStartIdx);
    if (blockEndIdx === -1) {
      console.log('Could not find closing brace for', stepName);
      break;
    }

    // Check if already wrapped
    const content = result.substring(blockStartIdx, blockEndIdx);
    if (content.includes('withStepTimeout')) {
      searchIdx = blockEndIdx;
      continue;
    }

    const prefix = isNonIdempotent 
      ? `{\n      await markOpStarted(db, correlationId, "${stepName}");\n      await withStepTimeout("${stepName}", 600000, async () => {`
      : `{\n      await withStepTimeout("${stepName}", 600000, async () => {`;
    
    const suffix = `});\n    }`;

    result = result.substring(0, blockStartIdx) + prefix + result.substring(blockStartIdx + 1, blockEndIdx) + suffix + result.substring(blockEndIdx + 1);
    searchIdx = idx + opStr.length + prefix.length;
  }
  return result;
}

for (const step of stepsToWrapIdempotent) {
  code = wrapStep(code, step, false);
}
for (const step of stepsToWrapNonIdempotent) {
  code = wrapStep(code, step, true);
}

fs.writeFileSync('infra/worker-service/src/provision-runtime.ts', code);
