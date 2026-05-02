#!/usr/bin/env node
/**
 * Pull third-party images explicitly (reliable layers before compose up).
 *
 *   pnpm images:pull
 *
 * Optional registry mirror for pre-built Stockix BigCapital images (skip local docker build):
 *
 *   STOCKIX_BC_PULL_PREFIX=ghcr.io/myorg/stockix-bc
 *   STOCKIX_BC_TAG=1.2.0
 *   pnpm images:pull
 *
 * Expects remote images named:
 *   ${PREFIX}-webapp:${TAG}
 *   ${PREFIX}-server:${TAG}
 *   ${PREFIX}-nginx:${TAG}
 *   ${PREFIX}-migration:${TAG}
 *
 * Tags them as stockix/bigcapital-*:${TAG} for docker-compose.yml.
 */
import { execFileSync } from "node:child_process";

const EXTERNAL_IMAGES = [
  "browserless/chrome:latest",
  "postgres:16-alpine",
];

function pullList(images) {
  for (const img of images) {
    console.error(`docker pull ${img}`);
    execFileSync("docker", ["pull", img], { stdio: "inherit" });
  }
}

function pullRegistryMirroredStockix() {
  const prefix = process.env.STOCKIX_BC_PULL_PREFIX?.trim();
  if (!prefix) {
    console.error(
      "STOCKIX_BC_PULL_PREFIX not set — skipped pulling stockix/bigcapital-* from registry (run `pnpm images:tenant` to build locally).",
    );
    return false;
  }

  const tag = process.env.STOCKIX_BC_TAG?.trim() || "latest";
  const pairs = [
    [`${prefix}-webapp`, "stockix/bigcapital-webapp"],
    [`${prefix}-server`, "stockix/bigcapital-server"],
    [`${prefix}-nginx`, "stockix/bigcapital-nginx"],
    [`${prefix}-migration`, "stockix/bigcapital-migration"],
  ];

  for (const [remoteRepo, localRepo] of pairs) {
    const remote = `${remoteRepo}:${tag}`;
    const local = `${localRepo}:${tag}`;
    console.error(`docker pull ${remote}`);
    execFileSync("docker", ["pull", remote], { stdio: "inherit" });
    console.error(`docker tag ${remote} ${local}`);
    execFileSync("docker", ["tag", remote, local], { stdio: "inherit" });
  }

  console.error(
    `Tagged stockix/bigcapital-*:${tag} from registry prefix ${prefix}`,
  );
  return true;
}

pullList(EXTERNAL_IMAGES);
pullRegistryMirroredStockix();
