import type { Hono } from "hono";

import type { createDb } from "@repo/db";

import { createActorResolver, createPlatformAuthGate, type ControlPlaneAuthEnv } from "./auth.js";
import { createIdempotencyMiddleware } from "./idempotency.js";
import { createRoleRankRbacMiddleware } from "./rbac.js";

type Db = ReturnType<typeof createDb>;

export function registerControlPlaneMiddleware(
  app: Hono<ControlPlaneAuthEnv>,
  options: {
    db: Db | null;
    platformApiSecret: string | undefined;
    workerSecret: string | undefined;
  },
): void {
  const { db, platformApiSecret, workerSecret } = options;
  app.use("/*", createPlatformAuthGate(platformApiSecret, workerSecret));
  app.use("/*", createActorResolver(db, platformApiSecret));
  app.use("/*", createIdempotencyMiddleware(db));
  app.use("/*", createRoleRankRbacMiddleware(db));
}
