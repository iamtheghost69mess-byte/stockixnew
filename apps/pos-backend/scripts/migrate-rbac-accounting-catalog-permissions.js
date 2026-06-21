#!/usr/bin/env node
/**
 * RBAC repair: add new accounting catalog permission IDs to existing tenant `RbacConfig`
 * when roles use explicit `can` lists (especially `builtinOverrides` / `customRoles`).
 *
 * ## When to run
 * After deploying new accounting features (expense reports, approvals inbox, consolidated reports)
 * if some users still get 403 / hidden nav despite having had "full GL read" style access before.
 *
 * ## Usage
 * - Dry run (default): `node scripts/migrate-rbac-accounting-catalog-permissions.js`
 * - Apply: `node scripts/migrate-rbac-accounting-catalog-permissions.js --apply`
 * - Also grant write bundle (expenses.write + approvals.write) when role has `gl.write`:
 *   `node scripts/migrate-rbac-accounting-catalog-permissions.js --apply --include-writes`
 * - Single org: `node scripts/migrate-rbac-accounting-catalog-permissions.js --apply --org=<MongoObjectId>`
 *
 * Requires `MONGODB_URI` / database URI from `config/config.js`.
 *
 * ## Rollback
 * Restore `RbacConfig` from DB backup, or `$pull` the added permission strings from affected `can`
 * arrays (dry-run output lists org id + role + added ids).
 *
 * @see docs/RBAC_ACCOUNTING_PERMISSIONS_MIGRATION.md
 */

require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const RbacConfig = require("../models/rbacConfigModel");
const { BUILTIN_ROLE_KEYS } = require("../constants/permissionsCatalog");
const { validateRbacConfigPayload } = require("../utils/rbacPayloadValidation");
const { invalidateRbacCache } = require("../services/rbacService");
const {
  computeAllAdds,
  applyAdds,
} = require("./lib/rbacAccountingCatalogMigration");

/**
 * @param {string[]} argv
 * @returns {{ apply: boolean; includeWrites: boolean; orgId: string | null }}
 */
function parseArgs(argv) {
  let apply = false;
  let includeWrites = false;
  /** @type {string | null} */
  let orgId = null;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else if (a === "--include-writes") includeWrites = true;
    else if (a.startsWith("--org=")) orgId = a.slice("--org=".length).trim() || null;
  }
  return { apply, includeWrites, orgId };
}

/**
 * @typedef {{ kind: "builtin"; roleKey: string; before: string[]; after: string[]; adds: string[] }} BuiltinPlan
 * @typedef {{ kind: "custom"; index: number; key: string; before: string[]; after: string[]; adds: string[] }} CustomPlan
 * @typedef {BuiltinPlan | CustomPlan} MigrationPlan
 */

/**
 * @param {import("mongoose").Document} doc
 * @param {boolean} includeWrites
 * @returns {MigrationPlan[]}
 */
function collectPlannedMutations(doc, includeWrites) {
  /** @type {MigrationPlan[]} */
  const plans = [];
  const o = doc.toObject ? doc.toObject() : { ...doc };

  const overrides = o.builtinOverrides && typeof o.builtinOverrides === "object" ? o.builtinOverrides : {};
  for (const roleKey of BUILTIN_ROLE_KEYS) {
    const entry = overrides[roleKey];
    if (!entry || !Array.isArray(entry.can)) continue;
    const adds = computeAllAdds(entry.can, includeWrites);
    if (!adds.length) continue;
    const after = applyAdds(entry.can, adds);
    plans.push({
      kind: "builtin",
      roleKey,
      before: entry.can.map((x) => String(x)),
      after,
      adds,
    });
  }

  const custom = Array.isArray(o.customRoles) ? o.customRoles : [];
  for (let i = 0; i < custom.length; i += 1) {
    const cr = custom[i];
    if (!cr || !Array.isArray(cr.can)) continue;
    const adds = computeAllAdds(cr.can, includeWrites);
    if (!adds.length) continue;
    const after = applyAdds(cr.can, adds);
    plans.push({
      kind: "custom",
      index: i,
      key: String(cr.key),
      before: cr.can.map((x) => String(x)),
      after,
      adds,
    });
  }
  return plans;
}

/**
 * @param {import("mongoose").Document} doc
 * @param {readonly MigrationPlan[]} plans
 */
function applyPlansToDocument(doc, plans) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  const hasBuiltin = plans.some((x) => x.kind === "builtin");
  const hasCustom = plans.some((x) => x.kind === "custom");

  if (hasBuiltin) {
    const overrides = { ...(o.builtinOverrides || {}) };
    for (const p of plans) {
      if (p.kind !== "builtin") continue;
      const prev =
        overrides[p.roleKey] && typeof overrides[p.roleKey] === "object"
          ? overrides[p.roleKey]
          : {};
      overrides[p.roleKey] = {
        ...prev,
        can: [...p.after],
      };
    }
    doc.set("builtinOverrides", overrides);
    doc.markModified("builtinOverrides");
  }

  if (hasCustom) {
    const customRoles = Array.isArray(o.customRoles)
      ? o.customRoles.map((c) => ({ ...c }))
      : [];
    for (const p of plans) {
      if (p.kind !== "custom") continue;
      if (p.index >= 0 && p.index < customRoles.length) {
        customRoles[p.index] = { ...customRoles[p.index], can: [...p.after] };
      }
    }
    doc.set("customRoles", customRoles);
    doc.markModified("customRoles");
  }
}

async function main() {
  const { apply, includeWrites, orgId } = parseArgs(process.argv.slice(2));
  if (!apply) {
    console.log("[migrate-rbac-accounting-catalog-permissions] DRY RUN (pass --apply to persist)\n");
  } else {
    console.log("[migrate-rbac-accounting-catalog-permissions] APPLY mode\n");
  }
  if (includeWrites) {
    console.log("Include-writes: ON (gl.write → expenses.write + approvals.write)\n");
  }

  await mongoose.connect(config.databaseURI);

  /** @type {Record<string, unknown>} */
  const filter = {};
  if (orgId) {
    if (!mongoose.Types.ObjectId.isValid(orgId)) {
      console.error("Invalid --org ObjectId");
      process.exitCode = 1;
      await mongoose.disconnect();
      return;
    }
    const oid = new mongoose.Types.ObjectId(orgId);
    const exists = await RbacConfig.exists({ organization: oid });
    if (!exists) {
      console.error(`No RbacConfig for organization ${orgId}`);
      process.exitCode = 1;
      await mongoose.disconnect();
      return;
    }
    filter.organization = oid;
  }

  const cursor = RbacConfig.find(filter);
  let docCount = 0;
  let planRowCount = 0;

  for await (const doc of cursor) {
    docCount += 1;
    const plans = collectPlannedMutations(doc, includeWrites);
    if (!plans.length) continue;

    const orgLabel =
      doc.organization != null ? String(doc.organization) : "null (legacy)";
    console.log(`RbacConfig org=${orgLabel} _id=${doc._id}`);
    for (const p of plans) {
      if (p.kind === "builtin") {
        console.log(`  builtinOverrides.${p.roleKey}.can`);
      } else {
        console.log(`  customRoles[${p.index}] key=${p.key}`);
      }
      console.log(`    + ${JSON.stringify(p.adds)}`);
      planRowCount += 1;
    }

    if (apply) {
      applyPlansToDocument(doc, plans);
      const err = validateRbacConfigPayload(doc.builtinOverrides, doc.customRoles);
      if (err) {
        console.error(`  VALIDATION FAILED: ${err}`);
        process.exitCode = 1;
        await mongoose.disconnect();
        return;
      }
      await doc.save();
      invalidateRbacCache(doc.organization != null ? doc.organization : null);
    }
  }

  console.log(
    `\nDone. Documents scanned: ${docCount}. Role can-arrays with planned changes: ${planRowCount}.`
  );
  if (!apply && planRowCount > 0) {
    console.log("Re-run with --apply to persist (after review).");
  }

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
    mongoose.disconnect().catch(() => {});
  });
}
