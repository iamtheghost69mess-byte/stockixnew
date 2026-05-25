/**
 * End-to-end property audit (RentTools pattern).
 * Read-only — surfaces data inconsistencies: double-bookings, stale feeds,
 * broken channel links, override conflicts, unusual buffer settings.
 */

import { and, eq, gte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import {
  pmsProperties,
  pmsIcalChannels,
  pmsBookings,
  pmsCalendarEvents,
  pmsDateOverrides,
} from "@repo/db/schema";

export type AuditSeverity = "error" | "warning" | "info";

export interface AuditFinding {
  severity: AuditSeverity;
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PropertyAuditReport {
  propertyId: string;
  propertyName: string;
  generatedAt: string;
  settings: {
    minNights: number;
    bookingWindow: number;
    cleaningEnabled: boolean;
    checkInTime: string;
    checkOutTime: string;
    feedSlugSet: boolean;
  };
  channels: Array<{
    platform: string;
    bufferBefore: number;
    bufferAfter: number;
    lastSyncedAt: string | null;
    lastError: string | null;
    failureCount: number;
    minutesSinceLastSync: number | null;
  }>;
  counts: {
    bookings: number;
    upcomingBookings: number;
    syncedEvents: number;
    upcomingSyncedEvents: number;
    overrides: { open: number; closed: number };
  };
  findings: AuditFinding[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

type Db = PostgresJsDatabase<typeof schema>;

export async function auditProperty(db: Db, tenantId: string, propertyId: string): Promise<PropertyAuditReport> {
  const todayStr = today();

  const [property] = await db
    .select()
    .from(pmsProperties)
    .where(and(eq(pmsProperties.id, propertyId), eq(pmsProperties.tenantId, tenantId)))
    .limit(1);

  if (!property) throw new Error(`Property ${propertyId} not found`);

  const [channels, bookings, events, overrides] = await Promise.all([
    db.select().from(pmsIcalChannels).where(and(eq(pmsIcalChannels.propertyId, propertyId), eq(pmsIcalChannels.tenantId, tenantId))),
    db.select().from(pmsBookings).where(and(eq(pmsBookings.propertyId, propertyId), eq(pmsBookings.tenantId, tenantId))),
    db.select().from(pmsCalendarEvents).where(and(eq(pmsCalendarEvents.propertyId, propertyId), eq(pmsCalendarEvents.tenantId, tenantId))),
    db.select().from(pmsDateOverrides).where(and(eq(pmsDateOverrides.propertyId, propertyId), eq(pmsDateOverrides.tenantId, tenantId))),
  ]);

  const findings: AuditFinding[] = [];

  // ─── Settings ───────────────────────────────────────────────────────────────
  if (channels.length === 0) {
    findings.push({
      severity: "warning", category: "settings",
      message: "No iCal channels connected. OTA bookings won't sync and the outbound feed has nothing to merge.",
    });
  }
  if (!property.feedSlug) {
    findings.push({
      severity: "info", category: "settings",
      message: "No iCal feed slug set — the outbound feed URL is not available until a slug is assigned.",
    });
  }

  // ─── Channel health ───────────────────────────────────────────────────────
  for (const ch of channels) {
    if (ch.lastError) {
      findings.push({
        severity: "error", category: "feed",
        message: `Last sync from ${ch.platform} failed: ${ch.lastError}`,
        details: { platform: ch.platform, failureCount: ch.failureCount },
      });
    }
    if (ch.lastSyncedAt) {
      const ageMin = Math.round((Date.now() - ch.lastSyncedAt.getTime()) / 60_000);
      if (ageMin > 60 && !ch.lastError) {
        findings.push({
          severity: "warning", category: "feed",
          message: `${ch.platform} hasn't synced in ${ageMin} minutes — cron may be stopped or the URL changed.`,
          details: { platform: ch.platform, ageMinutes: ageMin },
        });
      }
    } else if (ch.importUrl) {
      findings.push({
        severity: "warning", category: "feed",
        message: `${ch.platform} has an import URL but has never synced. The URL might be wrong.`,
        details: { platform: ch.platform },
      });
    }
    if (ch.bufferBefore > 7 || ch.bufferAfter > 7) {
      findings.push({
        severity: "warning", category: "cleaning",
        message: `${ch.platform} has unusual buffer (${ch.bufferBefore}d before / ${ch.bufferAfter}d after). Values above 7 typically indicate a misconfiguration.`,
        details: { platform: ch.platform, bufferBefore: ch.bufferBefore, bufferAfter: ch.bufferAfter },
      });
    }
  }

  // ─── Booking overlaps ────────────────────────────────────────────────────
  for (let i = 0; i < bookings.length; i++) {
    const a = bookings[i]!;
    for (let j = i + 1; j < bookings.length; j++) {
      const b = bookings[j]!;
      if (a.roomId !== b.roomId) continue;
      if (overlaps(a.checkIn, a.checkOut, b.checkIn, b.checkOut) &&
          a.bookingStatus !== "cancelled" && b.bookingStatus !== "cancelled") {
        findings.push({
          severity: "error", category: "reservation",
          message: `Bookings overlap: ${a.checkIn}–${a.checkOut} (${a.platform}) and ${b.checkIn}–${b.checkOut} (${b.platform}). Review and cancel one.`,
          details: { aId: a.id, bId: b.id },
        });
      }
    }
  }

  // Booking vs synced OTA events cross-platform collision
  for (const bk of bookings) {
    if (bk.bookingStatus === "cancelled") continue;
    for (const ev of events) {
      if (ev.platform === bk.platform) continue;
      if (overlaps(bk.checkIn, bk.checkOut, ev.startDate, ev.endDate)) {
        findings.push({
          severity: "error", category: "reservation",
          message: `Booking (${bk.platform}) on ${bk.checkIn}–${bk.checkOut} overlaps a synced ${ev.platform} event on ${ev.startDate}–${ev.endDate}. Likely double-booking.`,
          details: { bookingId: bk.id, eventUid: ev.icalUid, eventPlatform: ev.platform },
        });
      }
    }
  }

  // ─── Override consistency ────────────────────────────────────────────────
  const coveredDates = new Set<string>();
  for (const bk of bookings) {
    if (bk.bookingStatus === "cancelled") continue;
    let d = bk.checkIn;
    while (d < bk.checkOut) { coveredDates.add(d); d = addDays(d, 1); }
  }
  for (const ev of events) {
    let d = ev.startDate;
    while (d < ev.endDate) { coveredDates.add(d); d = addDays(d, 1); }
  }
  const conflictOpen = overrides.filter((o) => o.type === "open" && coveredDates.has(o.date)).map((o) => o.date);
  if (conflictOpen.length > 0) {
    findings.push({
      severity: "warning", category: "override",
      message: `${conflictOpen.length} "open" override(s) on dates already covered by bookings. The feed filters these out but you can clear them to keep data clean.`,
      details: { dates: conflictOpen },
    });
  }

  // ─── Cleaning flag ───────────────────────────────────────────────────────
  if (!property.cleaningEnabled) {
    findings.push({
      severity: "info", category: "cleaning",
      message: "Cleaning automation is disabled for this property.",
    });
  }

  const upcomingBookings = bookings.filter((b) => b.checkOut >= todayStr && b.bookingStatus !== "cancelled").length;
  const upcomingSyncedEvents = events.filter((e) => e.endDate >= todayStr).length;

  return {
    propertyId: property.id,
    propertyName: property.name,
    generatedAt: new Date().toISOString(),
    settings: {
      minNights: property.minNights,
      bookingWindow: property.bookingWindow,
      cleaningEnabled: property.cleaningEnabled,
      checkInTime: property.checkInTime,
      checkOutTime: property.checkOutTime,
      feedSlugSet: !!property.feedSlug,
    },
    channels: channels.map((ch) => ({
      platform: ch.platform,
      bufferBefore: ch.bufferBefore,
      bufferAfter: ch.bufferAfter,
      lastSyncedAt: ch.lastSyncedAt?.toISOString() ?? null,
      lastError: ch.lastError,
      failureCount: ch.failureCount,
      minutesSinceLastSync: ch.lastSyncedAt
        ? Math.round((Date.now() - ch.lastSyncedAt.getTime()) / 60_000)
        : null,
    })),
    counts: {
      bookings: bookings.length,
      upcomingBookings,
      syncedEvents: events.length,
      upcomingSyncedEvents,
      overrides: {
        open: overrides.filter((o) => o.type === "open").length,
        closed: overrides.filter((o) => o.type === "closed").length,
      },
    },
    findings,
  };
}
