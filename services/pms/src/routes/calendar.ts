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
  const toRaw = c.req.query("to");

  // Cap the query window at 730 days to prevent unbounded table scans.
  const effectiveTo = (() => {
    const base = from ?? new Date().toISOString().slice(0, 10);
    const cap = new Date(`${base}T12:00:00Z`);
    cap.setUTCDate(cap.getUTCDate() + 730);
    const capStr = cap.toISOString().slice(0, 10);
    return toRaw && toRaw < capStr ? toRaw : capStr;
  })();

  const conds = [eq(pmsCalendarEvents.tenantId, tenantId(c))];
  if (propertyId) conds.push(eq(pmsCalendarEvents.propertyId, propertyId));
  if (from) conds.push(gte(pmsCalendarEvents.endDate, from));
  conds.push(lte(pmsCalendarEvents.startDate, effectiveTo));
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
