import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { pmsIcalChannels, pmsSyncLogs } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors } from "./_utils.js";
import { generateExportToken } from "../ical/sync.js";
import { syncCalendars } from "../lib/calendar-sync.js";
import type { PmsEnv } from "../types.js";

export const channelsRouter = new Hono<PmsEnv>();

const createSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1),
  platform: z.enum(["airbnb", "booking", "vrbo", "expedia", "direct", "other"]).optional(),
  importUrl: z.string().url().optional(),
  bufferBefore: z.number().int().min(0).optional(),
  bufferAfter: z.number().int().min(0).optional(),
});

channelsRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const conds = [eq(pmsIcalChannels.tenantId, tenantId(c))];
  if (propertyId) conds.push(eq(pmsIcalChannels.propertyId, propertyId));
  const rows = await db.select().from(pmsIcalChannels).where(and(...conds)).orderBy(desc(pmsIcalChannels.createdAt));
  return c.json({ channels: rows });
});

channelsRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = createSchema.parse(await c.req.json());
  const [row] = await db.insert(pmsIcalChannels).values({
    tenantId: tenantId(c), propertyId: body.propertyId, name: body.name,
    platform: body.platform ?? "other", importUrl: body.importUrl,
    exportToken: generateExportToken(),
    bufferBefore: body.bufferBefore ?? 1, bufferAfter: body.bufferAfter ?? 1,
  }).returning();
  return c.json({ channel: row }, 201);
});

channelsRouter.patch("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({
    name: z.string().min(1).optional(), importUrl: z.string().url().optional(),
    platform: z.string().optional(),
    bufferBefore: z.number().int().min(0).optional(),
    bufferAfter: z.number().int().min(0).optional(),
  }).parse(await c.req.json());
  const [row] = await db.update(pmsIcalChannels).set({ ...body, updatedAt: new Date() })
    .where(and(eq(pmsIcalChannels.id, c.req.param("id")), eq(pmsIcalChannels.tenantId, tenantId(c)))).returning();
  if (!row) return errors.notFound(c, "channel");
  return c.json({ channel: row });
});

channelsRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db.delete(pmsIcalChannels).where(
    and(eq(pmsIcalChannels.id, c.req.param("id")), eq(pmsIcalChannels.tenantId, tenantId(c))),
  );
  return c.json({ ok: true });
});

// POST /api/channels/sync — Manual sync trigger
channelsRouter.post("/sync", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({ propertyIds: z.array(z.string().uuid()).optional() }).parse(await c.req.json());
  const summary = await syncCalendars(db, { tenantId: tenantId(c), propertyIds: body.propertyIds });
  return c.json({ summary });
});

// GET /api/channels/logs — Sync audit logs
channelsRouter.get("/logs", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const rows = await db.select().from(pmsSyncLogs)
    .where(eq(pmsSyncLogs.tenantId, tenantId(c))).orderBy(desc(pmsSyncLogs.createdAt)).limit(limit);
  return c.json({ logs: rows });
});
