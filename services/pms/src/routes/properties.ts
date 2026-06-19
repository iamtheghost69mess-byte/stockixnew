import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { pmsProperties } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import type { PmsEnv } from "../types.js";
import { randomBytes } from "node:crypto";
import { auditProperty } from "../lib/property-audit.js";

export const propertiesRouter = new Hono<PmsEnv>();

const createSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  description: z.string().optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  minNights: z.number().int().min(1).optional(),
  bookingWindow: z.number().int().min(1).optional(),
  cleaningEnabled: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  description: z.string().optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  minNights: z.number().int().min(1).optional(),
  bookingWindow: z.number().int().min(1).optional(),
  cleaningEnabled: z.boolean().optional(),
});

// GET /api/properties
propertiesRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsProperties)
    .where(and(eq(pmsProperties.tenantId, tenantId(c)), isNull(pmsProperties.deletedAt)))
    .orderBy(desc(pmsProperties.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ properties: rows, meta: listMeta(page, limit, rows.length) });
});

// POST /api/properties
propertiesRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = createSchema.parse(await c.req.json());
  const feedSlug = `p-${randomBytes(8).toString("base64url")}`;
  const [row] = await db
    .insert(pmsProperties)
    .values({
      tenantId: tenantId(c),
      name: body.name,
      type: body.type ?? "hotel",
      address: body.address,
      city: body.city,
      country: body.country,
      description: body.description,
      checkInTime: body.checkInTime ?? "14:00",
      checkOutTime: body.checkOutTime ?? "12:00",
      minNights: body.minNights ?? 1,
      bookingWindow: body.bookingWindow ?? 365,
      cleaningEnabled: body.cleaningEnabled ?? true,
      feedSlug,
    })
    .returning();
  return c.json({ property: row }, 201);
});

// GET /api/properties/:id
propertiesRouter.get("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .select()
    .from(pmsProperties)
    .where(and(
      eq(pmsProperties.id, c.req.param("id")),
      eq(pmsProperties.tenantId, tenantId(c)),
      isNull(pmsProperties.deletedAt),
    ))
    .limit(1);
  if (!row) return errors.notFound(c, "property");
  return c.json({ property: row });
});

// PATCH /api/properties/:id
propertiesRouter.patch("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = updateSchema.parse(await c.req.json());
  const [row] = await db
    .update(pmsProperties)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(pmsProperties.id, c.req.param("id")), eq(pmsProperties.tenantId, tenantId(c))))
    .returning();
  if (!row) return errors.notFound(c, "property");
  return c.json({ property: row });
});

// DELETE /api/properties/:id — soft delete
propertiesRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .update(pmsProperties)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(pmsProperties.id, c.req.param("id")),
      eq(pmsProperties.tenantId, tenantId(c)),
      isNull(pmsProperties.deletedAt),
    ))
    .returning({ id: pmsProperties.id });
  if (!row) return errors.notFound(c, "property");
  return c.json({ ok: true });
});

// GET /api/properties/:id/audit — end-to-end health check
propertiesRouter.get("/:id/audit", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  try {
    const report = await auditProperty(db, tenantId(c), c.req.param("id"));
    return c.json({ report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) return errors.notFound(c, "property");
    return c.json({ error: msg }, 500);
  }
});
