import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { pmsBookings, pmsRooms, pmsCleaningTasks } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors } from "./_utils.js";
import { syncBookingToFinance } from "../lib/finance-sync.js";
import type { PmsEnv } from "../types.js";

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
