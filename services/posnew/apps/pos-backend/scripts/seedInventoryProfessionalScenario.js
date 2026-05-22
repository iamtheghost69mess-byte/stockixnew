#!/usr/bin/env node
/**
 * One-command professional inventory seed for realistic POS/backoffice testing.
 *
 * What it prepares:
 * 1) Dev org + staff PIN logins (`seed:dev`) only when target org is `dev-org`
 * 2) Professional menu catalog (`seed:menu:professional`)
 * 3) Inventory/warehouse/procurement showcase dataset (`seed:inventory-ui`)
 * 4) Rich floor plan dataset (`seed:floor-plan`)
 * 5) Accounting baseline + sample finance data (`seed:accounting`, `seed:finance-showcase`)
 *
 * Usage:
 *   npm run seed:inventory:professional
 *   npm run seed:inventory:professional -- --force
 *   npm run seed:inventory:professional -- --org=my-org --force
 */
const { spawnSync } = require("child_process");

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const orgArg = args.find((arg) => arg.startsWith("--org="));
  const orgSlug = orgArg ? String(orgArg.slice("--org=".length)).trim() : "";
  return { force, orgSlug };
}

function runStep(name, command, args, env) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status || 1}`);
  }
}

function main() {
  const { force, orgSlug } = parseArgs();
  const targetOrg = orgSlug || process.env.SEED_ORG_SLUG || "dev-org";
  const sharedEnv = {
    ...process.env,
    SEED_ORG_SLUG: targetOrg,
    ORG_SLUG: targetOrg,
  };

  console.log("Professional inventory scenario seed");
  console.log(`Organization slug: ${targetOrg}`);
  console.log(`Force recreate showcase rows: ${force ? "yes" : "no"}`);

  const shouldSeedDevPins = targetOrg === "dev-org";
  if (shouldSeedDevPins) {
    runStep("Seed staff + organization", "npm", ["run", "seed:dev"], sharedEnv);
  } else {
    console.log("\n=== Seed staff + organization ===");
    console.log(
      `Skipping seed:dev because target org is "${targetOrg}" (non-dev). Existing org staff/PINs are preserved.`
    );
  }

  runStep(
    "Seed professional menu",
    "npm",
    ["run", "seed:menu:professional", "--", `--org=${targetOrg}`, ...(force ? ["--replace"] : [])],
    sharedEnv
  );

  runStep(
    "Seed inventory operations dataset",
    "npm",
    ["run", "seed:inventory-ui", "--", ...(force ? ["--force"] : [])],
    sharedEnv
  );

  runStep(
    "Seed floor plan showcase",
    "npm",
    ["run", "seed:floor-plan", "--", ...(force ? ["--force"] : [])],
    sharedEnv
  );

  runStep("Seed accounting baseline", "npm", ["run", "seed:accounting"], sharedEnv);
  runStep("Seed finance showcase", "npm", ["run", "seed:finance-showcase"], sharedEnv);

  console.log("\nDone.");
  if (shouldSeedDevPins) {
    console.log("Login PINs:");
    console.log("- admin 1001");
    console.log("- manager 1002");
    console.log("- waiter 1003");
    console.log("- cashier 1004");
    console.log("- kitchen 1005");
    console.log("- hostess 1006");
  } else {
    console.log(
      "Login PINs were not modified. Use your existing SaaS Owner dashboard staff PINs for this organization."
    );
  }
  console.log("\nRecommended first checks:");
  console.log("- /pos (waiter/cashier/hostess)");
  console.log("- /dashboard/inventory");
  console.log("- /dashboard/purchase-orders");
  console.log("- /dashboard/goods-receipt-notes");
  console.log("- /dashboard/warehouse");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
