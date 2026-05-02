/**
 * Build canonical Stockix BigCapital images (infra/tenant-stack/docker-compose.yml).
 *
 * Compose interpolation defaults live in env/development/tenant-docker-build.env (committed).
 *
 *   pnpm images:tenant
 *   pnpm images:tenant:minimal
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  assertComposeBuildSecrets,
  loadComposeBuildEnv,
} from "./load-compose-build-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const composeBase = join(repoRoot, "infra/tenant-stack/docker-compose.yml");

function usage() {
  console.log(`Usage: node scripts/build-stockix-tenant-images.mjs [--minimal]

Options:
  --minimal   webapp + nginx + database_migration only (skip server image)

Interpolation env: env/development/tenant-docker-build.env + process.env overrides.
`);
}

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
  usage();
  process.exit(0);
}

const minimal = argv.includes("--minimal");

const env = loadComposeBuildEnv(repoRoot);
assertComposeBuildSecrets(env);

const services = minimal
  ? ["webapp", "nginx", "database_migration"]
  : ["webapp", "nginx", "server", "database_migration"];

const dockerArgs = ["compose", "-f", composeBase, "build", ...services];

console.error("BIGCAPITAL_ROOT=%s", env.BIGCAPITAL_ROOT);
console.error("STOCKIX_BC_TAG=%s", env.STOCKIX_BC_TAG);
console.error("docker %s", dockerArgs.join(" "));

execFileSync("docker", dockerArgs, {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

console.error("Done. stockix/bigcapital-*:%s", env.STOCKIX_BC_TAG);
