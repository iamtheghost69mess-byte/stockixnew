import { Hono } from "hono";
import { eq, and, gte, lte } from "drizzle-orm";
import { pmsBookings, pmsRooms, pmsPayments, pmsProperties } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const reportsRouter = new Hono<PmsEnv>();

// GET /api/reports/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD
reportsRouter.get("/occupancy", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const today = new Date().toISOString().slice(0, 10);
  const from = c.req.query("from") ?? today;
  const to = c.req.query("to") ?? today;

  const rooms = await db.select().from(pmsRooms).where(eq(pmsRooms.tenantId, tid));
  const bookings = await db.select().from(pmsBookings).where(
    and(eq(pmsBookings.tenantId, tid), lte(pmsBookings.checkIn, to), gte(pmsBookings.checkOut, from)),
  );
  const totalRooms = rooms.length;
  const confirmed = bookings.filter((b) => b.bookingStatus !== "cancelled" && b.bookingStatus !== "no_show");

  // Calculate per-day occupancy over the range
  const days: { date: string; occupied: number; rate: number }[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10);
    const occupied = confirmed.filter((b) => b.checkIn <= dateStr && b.checkOut > dateStr).length;
    days.push({ date: dateStr, occupied, rate: totalRooms > 0 ? occupied / totalRooms : 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const avgRate = days.length > 0 ? days.reduce((s, d) => s + d.rate, 0) / days.length : 0;
  return c.json({ totalRooms, totalBookings: confirmed.length, averageOccupancyRate: avgRate, days });
});

// GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
reportsRouter.get("/revenue", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const from = c.req.query("from") ?? "2000-01-01";
  const to = c.req.query("to") ?? "2099-12-31";

  const bookings = await db.select().from(pmsBookings).where(
    and(eq(pmsBookings.tenantId, tid), gte(pmsBookings.checkIn, from), lte(pmsBookings.checkIn, to)),
  );
  const payments = await db.select().from(pmsPayments).where(eq(pmsPayments.tenantId, tid));

  const active = bookings.filter((b) => b.bookingStatus !== "cancelled");
  const totalRevenueCents = active.reduce((s, b) => s + b.totalAmountCents, 0);
  const totalCollectedCents = payments
    .filter((p) => p.status === "completed" && active.some((b) => b.id === p.bookingId))
    .reduce((s, p) => s + p.amountCents, 0);

  // Group by month
  const byMonth = new Map<string, { bookings: number; revenueCents: number }>();
  for (const b of active) {
    const month = b.checkIn.slice(0, 7);
    const entry = byMonth.get(month) ?? { bookings: 0, revenueCents: 0 };
    entry.bookings++;
    entry.revenueCents += b.totalAmountCents;
    byMonth.set(month, entry);
  }

  // Group by platform
  const byPlatform = new Map<string, { bookings: number; revenueCents: number }>();
  for (const b of active) {
    const entry = byPlatform.get(b.platform) ?? { bookings: 0, revenueCents: 0 };
    entry.bookings++;
    entry.revenueCents += b.totalAmountCents;
    byPlatform.set(b.platform, entry);
  }

  return c.json({
    totalBookings: active.length, totalRevenueCents, totalCollectedCents,
    outstandingCents: totalRevenueCents - totalCollectedCents,
    byMonth: Object.fromEntries(byMonth),
    byPlatform: Object.fromEntries(byPlatform),
  });
});

// GET /api/reports/guests
reportsRouter.get("/guests", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const bookings = await db.select().from(pmsBookings).where(eq(pmsBookings.tenantId, tenantId(c)));
  const active = bookings.filter((b) => b.bookingStatus !== "cancelled");
  const guestIds = new Set(active.map((b) => b.guestId));
  return c.json({
    totalGuests: guestIds.size, totalBookings: active.length,
    avgBookingsPerGuest: guestIds.size > 0 ? active.length / guestIds.size : 0,
    byStatus: {
      confirmed: active.filter((b) => b.bookingStatus === "confirmed").length,
      checked_in: active.filter((b) => b.bookingStatus === "checked_in").length,
      checked_out: active.filter((b) => b.bookingStatus === "checked_out").length,
    },
  });
});
