const fs = require('fs');
let code = fs.readFileSync('infra/worker-service/src/provision-runtime.ts', 'utf8');

const headerAndUtils = \
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
async function markOpStarted(db: any, correlationId: string, operationKey: string): Promise<void> {
  await db.insert(require('@repo/db/schema').tenantProvisionEvents).values({
    correlationId,
    phase: " started\,
