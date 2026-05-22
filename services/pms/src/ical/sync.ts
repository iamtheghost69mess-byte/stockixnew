import { randomBytes } from "node:crypto";
import {
  pmsBookings,
  pmsIcalChannels,
  pmsProperties,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";

/**
 * Placeholder iCal sync — fetches import URLs and updates lastSyncedAt.
 * Full RentTools merge logic can extend this module.
 */
export async function runIcalSyncForTenant(
  database: PostgresJsDatabase<typeof schema>,
  tenantId: string,
): Promise<{ synced: number; errors: string[] }> {
  const channels = await database
    .select()
    .from(pmsIcalChannels)
    .where(eq(pmsIcalChannels.tenantId, tenantId));

  const errors: string[] = [];
  let synced = 0;

  for (const channel of channels) {
    if (!channel.importUrl) continue;
    try {
      const res = await fetch(channel.importUrl, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        errors.push(`${channel.id}: HTTP ${res.status}`);
        continue;
      }
      await res.text();
      await database
        .update(pmsIcalChannels)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(pmsIcalChannels.id, channel.id));
      synced += 1;
    } catch (e) {
      errors.push(`${channel.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, errors };
}

export async function runIcalSyncAllTenants(
  database: PostgresJsDatabase<typeof schema>,
): Promise<void> {
  const props = await database
    .select({ tenantId: pmsProperties.tenantId })
    .from(pmsProperties);
  const tenantIds = [...new Set(props.map((p) => p.tenantId))];
  for (const tenantId of tenantIds) {
    await runIcalSyncForTenant(database, tenantId);
  }
}

export function generateExportToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function buildIcalFeed(
  database: PostgresJsDatabase<typeof schema>,
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

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stockix PMS//EN",
  ];
  for (const b of bookings) {
    const uid = b.id.replace(/-/g, "");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}@stockix-pms`);
    lines.push(`DTSTART;VALUE=DATE:${b.checkIn.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${b.checkOut.replace(/-/g, "")}`);
    lines.push(`SUMMARY:Booking ${b.bookingStatus}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
