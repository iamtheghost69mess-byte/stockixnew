"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProvisionTracer = createProvisionTracer;
const schema_1 = require("@repo/db/schema");
function createProvisionTracer(db, correlationId, getContext, log) {
    return {
        async event(phase, message, opts) {
            const level = opts?.level ?? "info";
            // Scrub oneTimeAdminPassword from meta before persisting to the DB (CRIT-02).
            const rawMeta = opts?.meta ?? null;
            let meta = rawMeta;
            if (meta && "oneTimeAdminPassword" in meta) {
                const { oneTimeAdminPassword: _scrubbed, ...rest } = meta;
                meta = rest;
            }
            const ctx = getContext();
            log(`[${phase}] ${message}`);
            await db.insert(schema_1.tenantProvisionEvents).values({
                correlationId,
                slug: ctx.slug,
                tenantId: ctx.tenantId ?? null,
                deploymentId: ctx.deploymentId ?? null,
                phase,
                level,
                message,
                meta,
            });
        },
    };
}
