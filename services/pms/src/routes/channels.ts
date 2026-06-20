import { lookup } from "node:dns/promises";
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, like } from "drizzle-orm";
import { pmsIcalChannels, pmsSyncLogs } from "@repo/pms-db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import { generateExportToken } from "../ical/sync.js";
import { syncCalendars } from "../lib/calendar-sync.js";
import { PLATFORM_PRESETS } from "../lib/platforms.js";
import type { PmsEnv } from "../types.js";

function isPrivateIp(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return true; // IPv6 or unrecognised — block to be safe
  const a = Number(m[1]), b = Number(m[2]);
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

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
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsIcalChannels)
    .where(and(...conds))
    .orderBy(desc(pmsIcalChannels.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ channels: rows, meta: listMeta(page, limit, rows.length) });
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

// GET /api/channels/alerts — 3-strike sync failure alerts (undismissed)
// Client passes ?since=ISO8601 to filter to alerts after a dismiss timestamp.
channelsRouter.get("/alerts", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const since = c.req.query("since");
  const conds = [
    eq(pmsSyncLogs.tenantId, tenantId(c)),
    eq(pmsSyncLogs.level, "error"),
    like(pmsSyncLogs.message, "[ALERT]%"),
  ];
  const sinceDate = since ? new Date(since) : null;
  if (since && (!sinceDate || isNaN(sinceDate.getTime()))) {
    return c.json({ error: "invalid_since_parameter" }, 400);
  }
  const rows = await db.select().from(pmsSyncLogs)
    .where(and(...conds)).orderBy(desc(pmsSyncLogs.createdAt)).limit(20);
  const alerts = sinceDate
    ? rows.filter((r) => r.createdAt && r.createdAt > sinceDate)
    : rows;
  return c.json({ alerts });
});

// GET /api/channels/platform-presets — OTA platform registry for the UI
channelsRouter.get("/platform-presets", (c) => c.json({ presets: PLATFORM_PRESETS }));

// POST /api/channels/validate-url — sanity-check a pasted iCal import URL
channelsRouter.post("/validate-url", async (c) => {
  const body = await c.req.json().catch(() => null);
  const raw = ((body as Record<string, unknown> | null)?.url as string | undefined ?? "").trim();
  if (!raw) return c.json({ ok: false, reason: "missing_url" });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return c.json({ ok: false, reason: "bad_url" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return c.json({ ok: false, reason: "bad_url" });
  }
  // SSRF protection: resolve hostname and block private/internal ranges
  let resolvedIp: string;
  try {
    const { address } = await lookup(url.hostname);
    resolvedIp = address;
  } catch {
    return c.json({ ok: false, reason: "unreachable" });
  }
  if (isPrivateIp(resolvedIp)) {
    return c.json({ ok: false, reason: "bad_url" });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "Stockix-PMS/1.0", Accept: "text/calendar, text/plain, */*" },
      redirect: "follow",
    });
  } catch {
    clearTimeout(timeout);
    return c.json({ ok: false, reason: "unreachable" });
  }
  clearTimeout(timeout);
  if (!res.ok) return c.json({ ok: false, reason: "unreachable", status: res.status });
  const reader = res.body?.getReader();
  if (!reader) return c.json({ ok: false, reason: "not_ical" });
  let head = "";
  let total = 0;
  try {
    while (total < 512) {
      const { done, value } = await reader.read();
      if (done) break;
      head += new TextDecoder().decode(value);
      total += value.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  if (!head.trim().startsWith("BEGIN:VCALENDAR")) {
    return c.json({ ok: false, reason: "not_ical" });
  }
  return c.json({ ok: true });
});

// POST /api/channels/:id/rotate-token — regenerate the iCal export token
channelsRouter.post("/:id/rotate-token", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .update(pmsIcalChannels)
    .set({ exportToken: generateExportToken(), updatedAt: new Date() })
    .where(and(eq(pmsIcalChannels.id, c.req.param("id")), eq(pmsIcalChannels.tenantId, tenantId(c))))
    .returning();
  if (!row) return errors.notFound(c, "channel");
  return c.json({ channel: row });
});
