import { Hono } from "hono";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { pmsCalendarEvents } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const calendarRouter = new Hono<PmsEnv>();

// GET /api/calendar/events?propertyId=...&from=...&to=...
calendarRouter.get("/events", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const conds = [eq(pmsCalendarEvents.tenantId, tenantId(c))];
  if (propertyId) conds.push(eq(pmsCalendarEvents.propertyId, propertyId));
  if (from) conds.push(gte(pmsCalendarEvents.endDate, from));
  if (to) conds.push(lte(pmsCalendarEvents.startDate, to));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsCalendarEvents)
    .where(and(...conds))
    .orderBy(desc(pmsCalendarEvents.startDate))
    .limit(limit)
    .offset(offset);
  return c.json({ events: rows, meta: listMeta(page, limit, rows.length) });
});
