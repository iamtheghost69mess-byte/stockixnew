import { randomBytes } from "node:crypto";
import { pmsBookings, pmsIcalChannels } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import { generateICal, generateBufferedEvents } from "../lib/ical.js";
import { syncCalendars, syncAllTenants } from "../lib/calendar-sync.js";

type Db = PostgresJsDatabase<typeof schema>;

// Re-export the production sync engine for the job runner
export { syncCalendars, syncAllTenants };

export function generateExportToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Build an iCal feed (.ics) for an export token.
 * Used by the public GET /api/ical/:token endpoint.
 * Generates buffered events to block availability on linked platforms.
 */
export async function buildIcalFeed(
  database: Db,
  exportToken: string,
): Promise<string | null> {
  const [channel] = await database
    .select()
    .from(pmsIcalChannels)
    .where(eq(pmsIcalChannels.exportToken, exportToken))
    .limit(1);
  if (!channel) return null;

  const bookings = await database
    .select()
    .from(pmsBookings)
    .where(
      and(
        eq(pmsBookings.tenantId, channel.tenantId),
        eq(pmsBookings.propertyId, channel.propertyId),
      ),
    );

  // Convert bookings to ICalEvent format
  const events = bookings
    .filter((b) => b.bookingStatus !== "cancelled" && b.bookingStatus !== "no_show")
    .map((b) => ({
      uid: `stockix-pms-booking-${b.id}`,
      summary: `Booking (${b.bookingStatus})`,
      startDate: b.checkIn,
      endDate: b.checkOut,
    }));

  // Generate buffered events (blocks availability with cleaning buffers)
  const buffered = generateBufferedEvents(
    events,
    channel.bufferBefore,
    channel.bufferAfter,
    channel.platform,
  );

  // Emit only the buffered events — they already span the full booking + buffer range.
  // Emitting both events + buffered would produce duplicate overlapping VEVENTs.
  return generateICal(buffered, `Stockix PMS — ${channel.name}`);
}
