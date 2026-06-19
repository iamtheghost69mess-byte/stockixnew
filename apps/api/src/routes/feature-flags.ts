import type { Hono } from "hono";
import { z } from "zod";
import type { createDb } from "@repo/db";
import { featureFlags } from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { getControlPlaneRedisClient } from "../lib/redis.js";
import { invalidateFlagCache } from "@repo/shared/feature-flags";

type Db = NonNullable<ReturnType<typeof createDb>>;

const featureFlagSchema = z.object({
  key: z.string().min(1).max(100),
  enabledGlobally: z.boolean().default(false),
  tenantOverrides: z.record(z.boolean()).default({}),
  description: z.string().optional(),
});

const patchFeatureFlagSchema = z.object({
  enabledGlobally: z.boolean().optional(),
  tenantOverrides: z.record(z.boolean()).optional(),
  description: z.string().optional(),
});

export function registerFeatureFlagRoutes(app: Hono<ControlPlaneAuthEnv>, db: Db): void {
  const redis = getControlPlaneRedisClient();

  app.get("/admin/feature-flags", async (c) => {
    const flags = await db.select().from(featureFlags);
    return c.json({ success: true, data: flags });
  });

  app.get("/admin/feature-flags/:key", async (c) => {
    const key = c.req.param("key");
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);

    if (!flag) {
      return c.json({ success: false, error: "Feature flag not found" }, 404);
    }
    return c.json({ success: true, data: flag });
  });

  app.post("/admin/feature-flags", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = featureFlagSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "validation_failed", details: parsed.error.format() }, 400);
    }

    const { key, enabledGlobally, tenantOverrides, description } = parsed.data;

    // Check uniqueness
    const [existing] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);

    if (existing) {
      return c.json({ success: false, error: "conflict", message: "Feature flag key already exists" }, 409);
    }

    const [inserted] = await db
      .insert(featureFlags)
      .values({
        key,
        enabledGlobally,
        tenantOverrides,
        description,
      })
      .returning();

    await invalidateFlagCache(redis, key);

    return c.json({ success: true, data: inserted }, 201);
  });

  app.patch("/admin/feature-flags/:key", async (c) => {
    const key = c.req.param("key");
    const body = await c.req.json().catch(() => ({}));
    const parsed = patchFeatureFlagSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "validation_failed", details: parsed.error.format() }, 400);
    }

    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);

    if (!flag) {
      return c.json({ success: false, error: "Feature flag not found" }, 404);
    }

    const updateData: Partial<typeof featureFlags.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (parsed.data.enabledGlobally !== undefined) {
      updateData.enabledGlobally = parsed.data.enabledGlobally;
    }
    if (parsed.data.tenantOverrides !== undefined) {
      // Merge overrides if requested, or replace them? We replace as standard PATCH behavior for this config field.
      updateData.tenantOverrides = parsed.data.tenantOverrides;
    }
    if (parsed.data.description !== undefined) {
      updateData.description = parsed.data.description;
    }

    const [updated] = await db
      .update(featureFlags)
      .set(updateData)
      .where(eq(featureFlags.key, key))
      .returning();

    await invalidateFlagCache(redis, key);

    return c.json({ success: true, data: updated });
  });

  app.delete("/admin/feature-flags/:key", async (c) => {
    const key = c.req.param("key");
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);

    if (!flag) {
      return c.json({ success: false, error: "Feature flag not found" }, 404);
    }

    await db.delete(featureFlags).where(eq(featureFlags.key, key));
    await invalidateFlagCache(redis, key);

    return c.json({ success: true, message: "Feature flag deleted" });
  });
}
