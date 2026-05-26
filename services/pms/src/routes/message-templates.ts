import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { pmsMessageTemplates } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const messageTemplatesRouter = new Hono<PmsEnv>();

const schema = z.object({
  propertyId: z.string().uuid().optional(),
  name: z.string().min(1),
  channel: z.enum(["email", "sms", "whatsapp"]).optional(),
  subject: z.string().optional(),
  body: z.string().min(1),
  trigger: z.enum(["pre_arrival", "check_in", "check_out", "post_stay", "custom"]).optional(),
  sendOffsetDays: z.number().int().optional(),
});

messageTemplatesRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const conds = [eq(pmsMessageTemplates.tenantId, tenantId(c))];
  if (propertyId) conds.push(eq(pmsMessageTemplates.propertyId, propertyId));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsMessageTemplates)
    .where(and(...conds))
    .orderBy(desc(pmsMessageTemplates.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ templates: rows, meta: listMeta(page, limit, rows.length) });
});

messageTemplatesRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = schema.parse(await c.req.json());
  const [row] = await db.insert(pmsMessageTemplates).values({
    tenantId: tenantId(c), propertyId: body.propertyId, name: body.name,
    channel: body.channel ?? "email", subject: body.subject ?? "",
    body: body.body, trigger: body.trigger ?? "custom", sendOffsetDays: body.sendOffsetDays ?? 0,
  }).returning();
  return c.json({ template: row }, 201);
});

messageTemplatesRouter.patch("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = schema.partial().parse(await c.req.json());
  const [row] = await db.update(pmsMessageTemplates).set({ ...body, updatedAt: new Date() })
    .where(and(eq(pmsMessageTemplates.id, c.req.param("id")), eq(pmsMessageTemplates.tenantId, tenantId(c)))).returning();
  if (!row) return errors.notFound(c, "message template");
  return c.json({ template: row });
});

messageTemplatesRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db.delete(pmsMessageTemplates).where(and(eq(pmsMessageTemplates.id, c.req.param("id")), eq(pmsMessageTemplates.tenantId, tenantId(c))));
  return c.json({ ok: true });
});
