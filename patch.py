import sys

with open('infra/worker-service/src/provision-runtime.ts', 'r') as f:
    code = f.read()

def find_closing_brace(s, start_idx):
    depth = 0
    in_string = False
    string_char = None
    in_line_comment = False
    in_block_comment = False
    
    i = start_idx
    while i < len(s):
        c = s[i]
        next_c = s[i+1] if i+1 < len(s) else ''
        
        if in_block_comment:
            if c == '*' and next_c == '/':
                in_block_comment = False
                i += 1
            i += 1
            continue
            
        if in_line_comment:
            if c == '\n':
                in_line_comment = False
            i += 1
            continue
            
        if in_string:
            if c == '\\':
                i += 2
                continue
            if c == string_char:
                in_string = False
            i += 1
            continue
            
        if c == '/' and next_c == '/':
            in_line_comment = True
            i += 1
            continue
        if c == '/' and next_c == '*':
            in_block_comment = True
            i += 1
            continue
        if c in ["'", '"', "`"]:
            in_string = True
            string_char = c
            i += 1
            continue
            
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1

def wrap_step(code, step, is_non_idempotent):
    search = f'if (!hasOp("{step}")) {{'
    search2 = f"if (!hasOp('{step}')) {{"
    
    idx = code.find(search)
    if idx == -1:
        idx = code.find(search2)
        search = search2
        
    while idx != -1:
        brace_idx = idx + len(search) - 1
        end_idx = find_closing_brace(code, brace_idx)
        
        if end_idx == -1:
            print(f'Failed to find brace for {step}')
            break
            
        inner_content = code[brace_idx+1:end_idx]
        if 'withStepTimeout' in inner_content:
            idx = code.find(search, end_idx)
            continue
            
        if is_non_idempotent:
            prefix = f'{{\n      await markOpStarted(db, correlationId, "{step}");\n      await withStepTimeout("{step}", 600000, async () => {{'
        else:
            prefix = f'{{\n      await withStepTimeout("{step}", 600000, async () => {{'
            
        suffix = '});\n    }'
        
        code = code[:brace_idx] + prefix + inner_content + suffix + code[end_idx+1:]
        idx = code.find(search, brace_idx + len(prefix) + len(inner_content) + len(suffix))
    return code

steps_idem = [
  'docker.network_connect',
  'edge.publish',
  'tenant.bootstrap_admin',
  'tenant.fetch_org_settings',
  'tenant.build_organization',
  'tenant.activate_warehouses'
]

steps_non_idem = [
  'tenant.complete_setup_wizard',
  'tenant.seed_pos_defaults',
  'add_module.finance_welcome_email'
]

# Ensure utility functions are present
if 'async function markOpStarted' not in code:
    util_str = '''
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
    message: `Started ${operationKey}`,
    meta: { operationKey, status: "started" },
  });
}

async function withStepTimeout<T>(stepName: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`step_timeout:${stepName}:${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function executeProvisionRuntime'''
    code = code.replace('export async function executeProvisionRuntime', util_str)

for s in steps_idem:
    code = wrap_step(code, s, False)
for s in steps_non_idem:
    code = wrap_step(code, s, True)

with open('infra/worker-service/src/provision-runtime.ts', 'w') as f:
    f.write(code)
