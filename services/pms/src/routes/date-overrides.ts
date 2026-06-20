import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { pmsDateOverrides } from "@repo/pms-db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const dateOverridesRouter = new Hono<PmsEnv>();

dateOverridesRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const conds = [eq(pmsDateOverrides.tenantId, tenantId(c))];
  if (propertyId) conds.push(eq(pmsDateOverrides.propertyId, propertyId));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsDateOverrides)
    .where(and(...conds))
    .orderBy(desc(pmsDateOverrides.date))
    .limit(limit)
    .offset(offset);
  return c.json({ overrides: rows, meta: listMeta(page, limit, rows.length) });
});

dateOverridesRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({
    propertyId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(["open", "closed"]).optional(),
    note: z.string().optional(),
  }).parse(await c.req.json());
  const [row] = await db.insert(pmsDateOverrides).values({
    tenantId: tenantId(c), propertyId: body.propertyId,
    date: body.date, type: body.type ?? "closed", note: body.note ?? "",
  }).onConflictDoUpdate({
    target: [pmsDateOverrides.propertyId, pmsDateOverrides.date],
    set: { type: body.type ?? "closed", note: body.note ?? "" },
  }).returning();
  return c.json({ override: row }, 201);
});

dateOverridesRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db.delete(pmsDateOverrides).where(and(eq(pmsDateOverrides.id, c.req.param("id")), eq(pmsDateOverrides.tenantId, tenantId(c))));
  return c.json({ ok: true });
});
