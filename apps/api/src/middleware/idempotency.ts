import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { apiIdempotencyKeys } from "@repo/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

import { logger } from "../lib/logger.js";
import type { ControlPlaneAuthEnv } from "./auth.js";

type Db = PostgresJsDatabase<typeof schema>;

const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Creates the idempotency key middleware.
 * Enforces Idempotency-Key header on privileged writes (POST/PATCH/DELETE)
 * to /owners and /tenants. Replays cached responses for duplicate requests.
 */
export function createIdempotencyMiddleware(
  db: Db | null,
): MiddlewareHandler<ControlPlaneAuthEnv> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    const isPrivilegedWrite =
      ["POST", "PATCH", "DELETE"].includes(method) &&
      (path.startsWith("/owners") || path.startsWith("/tenants"));
    if (!isPrivilegedWrite) return next();
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const actorId = c.get("actorId") as string | undefined;
    if (!actorId) {
      return c.json({ error: "unauthorized_actor" }, 401);
    }
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim() ?? "";
    if (!idempotencyKey) {
      return c.json(
        { error: "idempotency_key_required", message: "Missing Idempotency-Key header" },
        400,
      );
    }

    const requestBody = await c.req.raw.clone().text();
    const requestHash = createHash("sha256")
      .update(`${method}:${path}:${requestBody}`)
      .digest("hex");

    await db
      .delete(apiIdempotencyKeys)
      .where(sql`${apiIdempotencyKeys.expiresAt} < now()`)
      .catch((error) => {
        logger.error("idempotency prune failed", error);
      });

    const existingRows = await db
      .select({
        id: apiIdempotencyKeys.id,
        requestHash: apiIdempotencyKeys.requestHash,
        statusCode: apiIdempotencyKeys.statusCode,
        responseBody: apiIdempotencyKeys.responseBody,
      })
      .from(apiIdempotencyKeys)
      .where(and(eq(apiIdempotencyKeys.actorId, actorId), eq(apiIdempotencyKeys.key, idempotencyKey)))
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return c.json(
          {
            error: "idempotency_key_conflict",
            message: "Idempotency-Key was already used with a different request payload",
          },
          409,
        );
      }
      const body =
        existing.responseBody && typeof existing.responseBody === "object"
          ? existing.responseBody
          : { ok: true };
      return c.body(JSON.stringify(body), existing.statusCode as never, {
        "content-type": "application/json",
      });
    }

    await next();

    let responseText = "";
    try {
      responseText = await c.res.clone().text();
    } catch {
      responseText = "";
    }
    let parsedResponse: Record<string, unknown> = {};
    try {
      parsedResponse = responseText
        ? (JSON.parse(responseText) as Record<string, unknown>)
        : {};
    } catch {
      parsedResponse = { raw: responseText };
    }

    await db
      .insert(apiIdempotencyKeys)
      .values({
        key: idempotencyKey,
        actorId,
        method,
        path,
        requestHash,
        statusCode: c.res.status,
        responseBody: parsedResponse,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
      })
      .catch((error) => {
        logger.error("idempotency persist failed", error);
      });
  };
}
