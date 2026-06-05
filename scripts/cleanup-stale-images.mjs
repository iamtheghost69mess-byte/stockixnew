/**
 * Remove stale legacy tenant images (stockix-webapp:local, stockix-nginx:local).
 * These are unused after the shared-infra tenant-stack migration.
 *
 * Usage (repo root):
 *   pnpm docker:cleanup
 *   node scripts/cleanup-stale-images.mjs
 */
import { execa } from "execa";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const STALE_TAGS = ["stockix-webapp:local", "stockix-nginx:local"];

async function imageExists(tag) {
  const { exitCode } = await execa("docker", ["image", "inspect", tag], {
    reject: false,
    stdio: "ignore",
  });
  return exitCode === 0;
}

async function main() {
  const existing = [];
  for (const tag of STALE_TAGS) {
    if (await imageExists(tag)) {
      existing.push(tag);
    }
  }

  if (existing.length === 0) {
    console.log("[cleanup] No stale images found.");
    return;
  }

  console.log("[cleanup] Stale images found:");
  for (const tag of existing) {
    console.log(`  - ${tag}`);
  }

  const rl = createInterface({ input, output });
  const answer = await rl.question("These images are stale and unused. Remove? (y/N) ");
  rl.close();

  if (answer.trim().toLowerCase() !== "y") {
    console.log("[cleanup] Skipped.");
    return;
  }

  for (const tag of existing) {
    console.log(`[cleanup] Removing ${tag}...`);
    const { exitCode } = await execa("docker", ["rmi", tag], {
      reject: false,
      stdio: "inherit",
    });
    if (exitCode !== 0) {
      console.warn(`[cleanup] Warning: docker rmi exited ${exitCode} for ${tag}`);
    }
  }

  console.log("[cleanup] Done.");
}

main().catch((err) => {
  console.error("[cleanup] Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
