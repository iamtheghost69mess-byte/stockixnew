import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gt, lt, gte, lte } from "drizzle-orm";
import { pmsBookings, pmsRooms, pmsCleaningTasks, pmsProperties, pmsGuests } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import { syncBookingToFinance } from "../lib/finance-sync.js";
import type { PmsEnv } from "../types.js";

function escCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
  paymentStatus: z.enum(["pending", "partial", "paid", "refunded"]).optional(),
  adults: z.number().int().min(1).optional(),
  children: z.number().int().min(0).optional(),
  specialRequests: z.string().optional(),
  notes: z.string().optional(),
});

// ─── Literal routes first (Hono matches in registration order) ────────────────

// GET /api/bookings/export — CSV download
bookingsRouter.get("/export", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const propertyId = c.req.query("propertyId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const conds = [eq(pmsBookings.tenantId, tid)];
  if (propertyId) conds.push(eq(pmsBookings.propertyId, propertyId));
  if (from) conds.push(gte(pmsBookings.checkIn, from));
  if (to) conds.push(lte(pmsBookings.checkOut, to));

  const rows = await db.select().from(pmsBookings).where(and(...conds)).orderBy(desc(pmsBookings.checkIn));

  type BookingKey = keyof typeof rows[0];
  const COLS: BookingKey[] = ["id", "propertyId", "roomId", "guestId", "checkIn", "checkOut",
    "platform", "bookingStatus", "paymentStatus", "totalAmountCents", "adults", "children", "createdAt"];

  const lines = [COLS.join(",")];
  for (const r of rows) {
    lines.push(COLS.map((k) => escCsv(r[k])).join(","));
  }
  return c.text(lines.join("\r\n"), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="bookings-${tid.slice(0, 8)}.csv"`,
  });
});

// POST /api/bookings/import — bulk CSV import with overlap detection + dry-run
bookingsRouter.post("/import", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const dryRun = c.req.query("dryRun") === "true";
  const tid = tenantId(c);

  const csvText = stripBom(await c.req.text());
  if (!csvText.trim()) return errors.badRequest(c, "empty body");

  const csvRows = parseCsvRows(csvText);
  if (csvRows.length < 2) return errors.badRequest(c, "need header + at least one row");

  const headers = csvRows[0]!.map((h) => h.trim());
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { idx[h] = i; });

  for (const f of ["propertyId", "roomId", "guestId", "checkIn", "checkOut"] as const) {
    if (idx[f] === undefined) return errors.badRequest(c, `Missing column: ${f}`);
  }

  // Pre-load valid tenant-owned IDs to prevent IDOR (fix #5)
  const ownedProperties = new Set(
    (await db.select({ id: pmsProperties.id }).from(pmsProperties).where(eq(pmsProperties.tenantId, tid))).map((r) => r.id),
  );
  const ownedRooms = new Set(
    (await db.select({ id: pmsRooms.id }).from(pmsRooms).where(eq(pmsRooms.tenantId, tid))).map((r) => r.id),
  );
  const ownedGuests = new Set(
    (await db.select({ id: pmsGuests.id }).from(pmsGuests).where(eq(pmsGuests.tenantId, tid))).map((r) => r.id),
  );

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
    // Tenant ownership check (fix #5)
    if (!ownedProperties.has(propertyId)) {
      results.push({ rowNumber: n, status: "error", reason: "Property not found or not accessible" });
      continue;
    }
    if (!ownedRooms.has(roomId)) {
      results.push({ rowNumber: n, status: "error", reason: "Room not found or not accessible" });
      continue;
    }
    if (!ownedGuests.has(guestId)) {
      results.push({ rowNumber: n, status: "error", reason: "Guest not found or not accessible" });
      continue;
    }

    // Half-open interval overlap: [checkIn, checkOut) — consecutive bookings do not overlap (fix #20)
    const overlap = await db.select({ id: pmsBookings.id }).from(pmsBookings).where(
      and(
        eq(pmsBookings.tenantId, tid),
        eq(pmsBookings.roomId, roomId),
        lt(pmsBookings.checkIn, checkOut),
        gt(pmsBookings.checkOut, checkIn),
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
    if (!created) { results.push({ rowNumber: n, status: "error", reason: "Insert failed" }); continue; }
    results.push({ rowNumber: n, status: "created", bookingId: created.id });
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

// ─── Collection routes ─────────────────────────────────────────────────────────

bookingsRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const statusRaw = c.req.query("status");
  const VALID_STATUSES = ["confirmed", "checked_in", "checked_out", "cancelled", "no_show"] as const;
  const status = statusRaw && (VALID_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : undefined;
  const conditions = [eq(pmsBookings.tenantId, tenantId(c))];
  if (propertyId) conditions.push(eq(pmsBookings.propertyId, propertyId));
  if (status) conditions.push(eq(pmsBookings.bookingStatus, status));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsBookings)
    .where(and(...conditions))
    .orderBy(desc(pmsBookings.checkIn))
    .limit(limit)
    .offset(offset);
  return c.json({ bookings: rows, meta: listMeta(page, limit, rows.length) });
});

bookingsRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = createSchema.parse(await c.req.json());
  const tid = tenantId(c);

  // Verify all FK fields belong to this tenant (fix #4: IDOR prevention)
  const [property] = await db.select({ id: pmsProperties.id }).from(pmsProperties)
    .where(and(eq(pmsProperties.id, body.propertyId), eq(pmsProperties.tenantId, tid))).limit(1);
  if (!property) return errors.notFound(c, "property");

  const [room] = await db.select({ id: pmsRooms.id }).from(pmsRooms)
    .where(and(eq(pmsRooms.id, body.roomId), eq(pmsRooms.tenantId, tid))).limit(1);
  if (!room) return errors.notFound(c, "room");

  const [guest] = await db.select({ id: pmsGuests.id }).from(pmsGuests)
    .where(and(eq(pmsGuests.id, body.guestId), eq(pmsGuests.tenantId, tid))).limit(1);
  if (!guest) return errors.notFound(c, "guest");

  const [row] = await db.insert(pmsBookings).values({
    tenantId: tid,
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
  }).returning();
  return c.json({ booking: row }, 201);
});

// ─── Item routes ───────────────────────────────────────────────────────────────

bookingsRouter.get("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db.select().from(pmsBookings)
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c)))).limit(1);
  if (!row) return errors.notFound(c, "booking");
  return c.json({ booking: row });
});

bookingsRouter.patch("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = updateSchema.parse(await c.req.json());
  const [row] = await db.update(pmsBookings)
    .set({ ...body, updatedAt: new Date() } as typeof pmsBookings.$inferInsert)
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c))))
    .returning();
  if (!row) return errors.notFound(c, "booking");
  return c.json({ booking: row });
});

bookingsRouter.post("/:id/check-in", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const [row] = await db.update(pmsBookings)
    .set({ bookingStatus: "checked_in", checkInActualAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tid)))
    .returning();
  if (!row) return errors.notFound(c, "booking");
  // Tenant-scoped room update (fix #11)
  await db.update(pmsRooms).set({ status: "occupied", updatedAt: new Date() })
    .where(and(eq(pmsRooms.id, row.roomId), eq(pmsRooms.tenantId, tid)));
  return c.json({ booking: row });
});

bookingsRouter.post("/:id/check-out", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const [row] = await db.update(pmsBookings)
    .set({ bookingStatus: "checked_out", checkOutActualAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tid)))
    .returning();
  if (!row) return errors.notFound(c, "booking");

  // Tenant-scoped room update (fix #11)
  await db.update(pmsRooms).set({ status: "cleaning", updatedAt: new Date() })
    .where(and(eq(pmsRooms.id, row.roomId), eq(pmsRooms.tenantId, tid)));

  // Auto-create cleaning task — skip if one already exists for this room today (fix #10)
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await db.select({ id: pmsCleaningTasks.id }).from(pmsCleaningTasks)
    .where(and(
      eq(pmsCleaningTasks.roomId, row.roomId),
      eq(pmsCleaningTasks.scheduledDate, today),
      eq(pmsCleaningTasks.tenantId, tid),
    )).limit(1);
  if (!existing) {
    await db.insert(pmsCleaningTasks).values({
      tenantId: tid,
      propertyId: row.propertyId,
      roomId: row.roomId,
      scheduledDate: today,
      notes: `Auto-created on checkout of booking ${row.id}`,
    });
  }

  // Fire Finance sync without blocking the HTTP response (fix #12)
  void syncBookingToFinance(db, {
    id: row.id,
    tenantId: tid,
    roomId: row.roomId,
    guestId: row.guestId,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    totalAmountCents: row.totalAmountCents,
    platform: row.platform,
    financeReceiptId: row.financeReceiptId,
  });

  return c.json({ booking: row, finance: { queued: true } });
});

bookingsRouter.post("/:id/cancel", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const [row] = await db.update(pmsBookings)
    .set({ bookingStatus: "cancelled", updatedAt: new Date() })
    .where(and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tid)))
    .returning();
  if (!row) return errors.notFound(c, "booking");
  // Tenant-scoped room update (fix #11)
  await db.update(pmsRooms).set({ status: "available", updatedAt: new Date() })
    .where(and(eq(pmsRooms.id, row.roomId), eq(pmsRooms.tenantId, tid)));
  return c.json({ booking: row });
});
