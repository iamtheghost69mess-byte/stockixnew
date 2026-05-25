import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { pmsBookings, pmsRooms, pmsCleaningTasks, pmsGuests } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors } from "./_utils.js";
import { syncBookingToFinance } from "../lib/finance-sync.js";
import type { PmsEnv } from "../types.js";

function escCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') { inQ = true; }
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); rows.push(cur); cur = []; field = "";
    } else field += c;
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (rows.length > 0 && rows[rows.length - 1]!.length === 1 && rows[rows.length - 1]![0] === "") rows.pop();
  return rows;
}

export const bookingsRouter = new Hono<PmsEnv>();

const createSchema = z.object({
  propertyId: z.string().uuid(),
  roomId: z.string().uuid(),
  guestId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmountCents: z.number().int().min(0).optional(),
  adults: z.number().int().min(1).optional(),
  children: z.number().int().min(0).optional(),
  platform: z.string().optional(),
  specialRequests: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  totalAmountCents: z.number().int().min(0).optional(),
  bookingStatus: z.enum(["confirmed", "checked_in", "checked_out", "cancelled", "no_show"]).optional(),
  paymentStatus: z.enum(["pending", "partial", "paid", "refunded"]).optional(),
  adults: z.number().int().min(1).optional(),
  children: z.number().int().min(0).optional(),
  specialRequests: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/bookings?propertyId=...&status=...
bookingsRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const status = c.req.query("status");
  const conditions = [eq(pmsBookings.tenantId, tenantId(c))];
  if (propertyId) conditions.push(eq(pmsBookings.propertyId, propertyId));
  if (status) conditions.push(eq(pmsBookings.bookingStatus, status));
  const rows = await db.select().from(pmsBookings).where(and(...conditions)).orderBy(desc(pmsBookings.checkIn));
  return c.json({ bookings: rows });
});

// POST /api/bookings
bookingsRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = createSchema.parse(await c.req.json());
  const [row] = await db
    .insert(pmsBookings)
    .values({
      tenantId: tenantId(c),
      propertyId: body.propertyId,
      roomId: body.roomId,
      guestId: body.guestId,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      totalAmountCents: body.totalAmountCents ?? 0,
      adults: body.adults ?? 1,
      children: body.children ?? 0,
      platform: body.platform ?? "direct",
      specialRequests: body.specialRequests,
      notes: body.notes,
    })
    .returning();
  return c.json({ booking: row }, 201);
});

// GET /api/bookings/:id
bookingsRouter.get("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .select()
    .from(pmsBookings)
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c))))
    .limit(1);
  if (!row) return errors.notFound(c, "booking");
  return c.json({ booking: row });
});

// PATCH /api/bookings/:id
bookingsRouter.patch("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = updateSchema.parse(await c.req.json());
  const [row] = await db
    .update(pmsBookings)
    .set({ ...body, updatedAt: new Date() } as typeof pmsBookings.$inferInsert)
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c))))
    .returning();
  if (!row) return errors.notFound(c, "booking");
  return c.json({ booking: row });
});

// POST /api/bookings/:id/check-in — Mark guest as checked in
bookingsRouter.post("/:id/check-in", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .update(pmsBookings)
    .set({ bookingStatus: "checked_in", checkInActualAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c))))
    .returning();
  if (!row) return errors.notFound(c, "booking");
  // Mark room as occupied
  await db.update(pmsRooms).set({ status: "occupied", updatedAt: new Date() }).where(eq(pmsRooms.id, row.roomId));
  return c.json({ booking: row });
});

// POST /api/bookings/:id/check-out — Mark guest as checked out + trigger Finance sync
bookingsRouter.post("/:id/check-out", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .update(pmsBookings)
    .set({ bookingStatus: "checked_out", checkOutActualAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c))))
    .returning();
  if (!row) return errors.notFound(c, "booking");

  // Mark room as cleaning and auto-create a cleaning task for today
  await db.update(pmsRooms).set({ status: "cleaning", updatedAt: new Date() }).where(eq(pmsRooms.id, row.roomId));
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(pmsCleaningTasks).values({
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    roomId: row.roomId,
    scheduledDate: today,
    notes: `Auto-created on checkout of booking ${row.id}`,
  }).onConflictDoNothing();

  // Trigger Finance sync (async, non-blocking)
  const financeResult = await syncBookingToFinance(db, {
    id: row.id,
    tenantId: row.tenantId,
    roomId: row.roomId,
    guestId: row.guestId,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    totalAmountCents: row.totalAmountCents,
    platform: row.platform,
    financeReceiptId: row.financeReceiptId,
  });

  return c.json({ booking: row, finance: financeResult });
});

// POST /api/bookings/:id/cancel
bookingsRouter.post("/:id/cancel", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .update(pmsBookings)
    .set({ bookingStatus: "cancelled", updatedAt: new Date() })
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c))))
    .returning();
  if (!row) return errors.notFound(c, "booking");
  // Free up the room
  await db.update(pmsRooms).set({ status: "available", updatedAt: new Date() }).where(eq(pmsRooms.id, row.roomId));
  return c.json({ booking: row });
});

// GET /api/bookings/export — download bookings as CSV
// Query: ?propertyId=&from=YYYY-MM-DD&to=YYYY-MM-DD
bookingsRouter.get("/export", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const tid = tenantId(c);

  const conds = [eq(pmsBookings.tenantId, tid)];
  if (propertyId) conds.push(eq(pmsBookings.propertyId, propertyId));
  if (from) conds.push(gte(pmsBookings.checkIn, from));
  if (to) conds.push(lte(pmsBookings.checkOut, to));

  const rows = await db.select().from(pmsBookings).where(and(...conds)).orderBy(desc(pmsBookings.checkIn));

  const COLS = ["id", "propertyId", "roomId", "guestId", "checkIn", "checkOut",
    "platform", "bookingStatus", "paymentStatus", "totalAmountCents", "adults", "children", "createdAt"] as const;

  const lines = [COLS.join(",")];
  for (const r of rows) {
    lines.push(COLS.map((k) => escCsv((r as Record<string, unknown>)[k])).join(","));
  }
  const csv = lines.join("\r\n");
  return c.text(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="bookings-${tid.slice(0, 8)}.csv"`,
  });
});

// POST /api/bookings/import — bulk CSV import with overlap detection
// Query: ?dryRun=true to validate without writing
bookingsRouter.post("/import", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const dryRun = c.req.query("dryRun") === "true";
  const tid = tenantId(c);
  const csvText = stripBom(await c.req.text());
  if (!csvText.trim()) return errors.badRequest(c, "empty body");

  const csvRows = parseCsvRows(csvText);
  if (csvRows.length < 2) return errors.badRequest(c, "need header + at least one row");

  const headers = (csvRows[0]!).map((h) => h.trim());
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => (idx[h] = i));

  const REQUIRED = ["propertyId", "roomId", "guestId", "checkIn", "checkOut"] as const;
  for (const f of REQUIRED) {
    if (idx[f] === undefined) return errors.badRequest(c, `Missing column: ${f}`);
  }

  type ImportRow = { rowNumber: number; status: "created" | "skipped" | "error"; reason?: string; bookingId?: string };
  const results: ImportRow[] = [];

  for (let r = 1; r < csvRows.length; r++) {
    const row = csvRows[r]!;
    const n = r + 1;
    const get = (k: string) => (row[idx[k]!] ?? "").trim();
    const propertyId = get("propertyId");
    const roomId = get("roomId");
    const guestId = get("guestId");
    const checkIn = get("checkIn");
    const checkOut = get("checkOut");
    const platform = get("platform") || "direct";

    if (!propertyId || !roomId || !guestId || !checkIn || !checkOut) {
      results.push({ rowNumber: n, status: "error", reason: "Missing required field" });
      continue;
    }
    if (checkOut <= checkIn) {
      results.push({ rowNumber: n, status: "error", reason: "checkOut must be after checkIn" });
      continue;
    }

    // Overlap detection
    const overlap = await db.select({ id: pmsBookings.id }).from(pmsBookings).where(
      and(
        eq(pmsBookings.tenantId, tid),
        eq(pmsBookings.roomId, roomId),
        lte(pmsBookings.checkIn, checkOut),
        gte(pmsBookings.checkOut, checkIn),
      ),
    ).limit(1);
    if (overlap.length > 0) {
      results.push({ rowNumber: n, status: "skipped", reason: `Overlaps booking ${overlap[0]!.id}` });
      continue;
    }

    if (dryRun) { results.push({ rowNumber: n, status: "created", reason: "(dry-run)" }); continue; }

    const [created] = await db.insert(pmsBookings).values({
      tenantId: tid, propertyId, roomId, guestId, checkIn, checkOut, platform,
    }).returning();
    results.push({ rowNumber: n, status: "created", bookingId: created!.id });
  }

  return c.json({
    summary: {
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      error: results.filter((r) => r.status === "error").length,
      dryRun,
    },
    results,
  });
});
