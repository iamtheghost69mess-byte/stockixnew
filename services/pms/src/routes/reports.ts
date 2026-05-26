import { Hono } from "hono";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";
import { pmsBookings, pmsRooms, pmsPayments } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, validateReportDateRange } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const reportsRouter = new Hono<PmsEnv>();

const REPORT_BOOKING_CAP = 10_000;

// GET /api/reports/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=50
reportsRouter.get("/occupancy", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const today = new Date().toISOString().slice(0, 10);
  const from = c.req.query("from") ?? today;
  const to = c.req.query("to") ?? today;
  const rangeError = validateReportDateRange(from, to);
  if (rangeError) return errors.badRequest(c, rangeError);

  const { page, limit, offset } = parsePagination(c);

  const rooms = await db
    .select()
    .from(pmsRooms)
    .where(eq(pmsRooms.tenantId, tid))
    .limit(1000);
  const bookings = await db
    .select()
    .from(pmsBookings)
    .where(
      and(eq(pmsBookings.tenantId, tid), lte(pmsBookings.checkIn, to), gte(pmsBookings.checkOut, from)),
    )
    .orderBy(desc(pmsBookings.createdAt))
    .limit(Math.min(limit, REPORT_BOOKING_CAP))
    .offset(offset);

  const totalRooms = rooms.length;
  const confirmed = bookings.filter((b) => b.bookingStatus !== "cancelled" && b.bookingStatus !== "no_show");

  const days: { date: string; occupied: number; rate: number }[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10);
    const occupied = confirmed.filter((b) => b.checkIn <= dateStr && b.checkOut > dateStr).length;
    days.push({ date: dateStr, occupied, rate: totalRooms > 0 ? occupied / totalRooms : 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const avgRate = days.length > 0 ? days.reduce((s, day) => s + day.rate, 0) / days.length : 0;
  return c.json({
    success: true,
    data: { totalRooms, totalBookings: confirmed.length, averageOccupancyRate: avgRate, days },
    meta: {
      page,
      limit,
      hasMore: bookings.length === limit,
      truncated: bookings.length >= REPORT_BOOKING_CAP,
    },
  });
});

// GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=50
reportsRouter.get("/revenue", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const today = new Date().toISOString().slice(0, 10);
  const from = c.req.query("from") ?? today;
  const to = c.req.query("to") ?? today;
  const rangeError = validateReportDateRange(from, to);
  if (rangeError) return errors.badRequest(c, rangeError);

  const { page, limit, offset } = parsePagination(c);

  const bookings = await db
    .select()
    .from(pmsBookings)
    .where(
      and(eq(pmsBookings.tenantId, tid), gte(pmsBookings.checkIn, from), lte(pmsBookings.checkIn, to)),
    )
    .orderBy(desc(pmsBookings.createdAt))
    .limit(Math.min(limit, REPORT_BOOKING_CAP))
    .offset(offset);

  const active = bookings.filter((b) => b.bookingStatus !== "cancelled");
  const bookingIds = active.map((b) => b.id);
  const payments =
    bookingIds.length > 0
      ? await db
          .select()
          .from(pmsPayments)
          .where(and(eq(pmsPayments.tenantId, tid), inArray(pmsPayments.bookingId, bookingIds)))
      : [];

  const totalRevenueCents = active.reduce((s, b) => s + b.totalAmountCents, 0);
  const totalCollectedCents = payments
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + p.amountCents, 0);

  const byMonth = new Map<string, { bookings: number; revenueCents: number }>();
  for (const b of active) {
    const month = b.checkIn.slice(0, 7);
    const entry = byMonth.get(month) ?? { bookings: 0, revenueCents: 0 };
    entry.bookings++;
    entry.revenueCents += b.totalAmountCents;
    byMonth.set(month, entry);
  }

  const byPlatform = new Map<string, { bookings: number; revenueCents: number }>();
  for (const b of active) {
    const entry = byPlatform.get(b.platform) ?? { bookings: 0, revenueCents: 0 };
    entry.bookings++;
    entry.revenueCents += b.totalAmountCents;
    byPlatform.set(b.platform, entry);
  }

  return c.json({
    success: true,
    data: {
      totalBookings: active.length,
      totalRevenueCents,
      totalCollectedCents,
      outstandingCents: totalRevenueCents - totalCollectedCents,
      byMonth: Object.fromEntries(byMonth),
      byPlatform: Object.fromEntries(byPlatform),
    },
    meta: {
      page,
      limit,
      hasMore: bookings.length === limit,
      truncated: bookings.length >= REPORT_BOOKING_CAP,
    },
  });
});

// GET /api/reports/guests?page=1&limit=50
reportsRouter.get("/guests", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const tid = tenantId(c);
  const { page, limit, offset } = parsePagination(c);

  const bookings = await db
    .select()
    .from(pmsBookings)
    .where(eq(pmsBookings.tenantId, tid))
    .orderBy(desc(pmsBookings.createdAt))
    .limit(limit)
    .offset(offset);

  const active = bookings.filter((b) => b.bookingStatus !== "cancelled");
  const guestIds = new Set(active.map((b) => b.guestId));

  return c.json({
    success: true,
    data: {
      totalGuests: guestIds.size,
      totalBookings: active.length,
      avgBookingsPerGuest: guestIds.size > 0 ? active.length / guestIds.size : 0,
      byStatus: {
        confirmed: active.filter((b) => b.bookingStatus === "confirmed").length,
        checked_in: active.filter((b) => b.bookingStatus === "checked_in").length,
        checked_out: active.filter((b) => b.bookingStatus === "checked_out").length,
      },
    },
    meta: { page, limit, hasMore: bookings.length === limit },
  });
});
