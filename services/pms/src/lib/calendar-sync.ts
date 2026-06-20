import { lookup } from "node:dns/promises";
import { pmsCalendarEvents, pmsIcalChannels, pmsProperties, pmsSyncLogs } from "@repo/pms-db/schema";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@repo/db/schema";
import type * as pmsSchema from "@repo/pms-db/schema";
import { parseICal, type ICalEvent } from "./ical.js";

type Db = PostgresJsDatabase<typeof pmsSchema>;

interface SyncOptions {
  tenantId: string;
  propertyIds?: string[];
}

interface SyncSummary {
  propertiesSynced: number;
  newEvents: number;
  removedEvents: number;
  errors: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isPrivateIp(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return true; // IPv6 or unrecognized — block to be safe
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

async function fetchICal(
  urlString: string,
): Promise<{ events: ICalEvent[]; error?: string }> {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { events: [], error: "SSRF prevention: Invalid protocol" };
    }
    let resolvedIp: string;
    try {
      const { address } = await lookup(url.hostname);
      resolvedIp = address;
    } catch (err) {
      return { events: [], error: `DNS resolution failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (isPrivateIp(resolvedIp)) {
      return { events: [], error: "SSRF prevention: URL resolves to a private IP address" };
    }

    const res = await fetch(urlString, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": "Stockix-PMS/1.0",
        Accept: "text/calendar, text/plain, */*",
      },
    });
    if (!res.ok) {
      return { events: [], error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const text = await res.text();
    if (!text.includes("VCALENDAR")) {
      return { events: [], error: "Response is not a valid iCal feed" };
    }
    return { events: parseICal(text) };
  } catch (err) {
    return { events: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function log(
  db: Db,
  tenantId: string,
  message: string,
  level: "info" | "warn" | "error" | "success" = "info",
  propertyId?: string,
): Promise<void> {
  try {
    await db.insert(pmsSyncLogs).values({ tenantId, message, level, propertyId });
  } catch {
    console.error(`[PMS SyncLog] [${level}]`, message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sync iCal feeds for all properties of a tenant.
 * Pass `propertyIds` to scope to specific properties (e.g. manual "Sync now").
 */
export async function syncCalendars(
  db: Db,
  opts: SyncOptions,
): Promise<SyncSummary> {
  const summary: SyncSummary = { propertiesSynced: 0, newEvents: 0, removedEvents: 0, errors: 0 };
  const { tenantId, propertyIds } = opts;

  if (propertyIds && propertyIds.length === 0) return summary;

  const links = await db
    .select()
    .from(pmsIcalChannels)
    .where(eq(pmsIcalChannels.tenantId, tenantId));

  const filteredLinks = propertyIds
    ? links.filter((l) => propertyIds.includes(l.propertyId))
    : links;

  if (filteredLinks.length === 0) return summary;

  // Group by property
  const byProperty = new Map<string, typeof filteredLinks>();
  for (const link of filteredLinks) {
    const arr = byProperty.get(link.propertyId) ?? [];
    arr.push(link);
    byProperty.set(link.propertyId, arr);
  }

  await log(
    db,
    tenantId,
    `Sync started: ${byProperty.size} properties, ${filteredLinks.length} feeds`,
  );

  for (const [propertyId, propertyLinks] of byProperty) {
    let propertyHadSuccess = false;
    for (const link of propertyLinks) {
      if (!link.importUrl) continue;

      try {
        const { events, error } = await fetchICal(link.importUrl);

        if (error) {
          summary.errors++;
          const newFailureCount = link.failureCount + 1;
          await db
            .update(pmsIcalChannels)
            .set({ lastError: error, lastSyncedAt: new Date(), failureCount: newFailureCount, updatedAt: new Date() })
            .where(eq(pmsIcalChannels.id, link.id));

          await log(db, tenantId, `${link.name} / ${link.platform}: Fetch failed — ${error}`, "error", propertyId);

          // Alert at 3 consecutive failures
          if (newFailureCount === 3) {
            await log(
              db,
              tenantId,
              `[ALERT] ${link.name} / ${link.platform}: 3 consecutive sync failures — feed may be broken. Last error: ${error}`,
              "error",
              propertyId,
            );
          }
          continue;
        }

        const today = new Date().toISOString().substring(0, 10);

        // Filter out past events and our own stockix-pms- prefixed events (feedback loop prevention)
        const filteredEvents = events.filter((e) => {
          if (e.endDate < today) return false;
          if (e.uid.startsWith("stockix-pms-")) return false;
          if (e.summary.includes("+buffer")) return false;
          if (e.summary === "Blocked (cleaning)") return false;
          return true;
        });

        // Drop 1-day CLOSED/Not-available blocks immediately before another event
        // (likely our own buffer days reflected back by the platform)
        const futureEvents = filteredEvents.filter((e) => {
          const duration = Math.round(
            (new Date(`${e.endDate}T12:00:00Z`).getTime() -
              new Date(`${e.startDate}T12:00:00Z`).getTime()) /
              86_400_000,
          );
          if (duration > 1) return true;
          if (!e.summary.includes("CLOSED") && !e.summary.includes("Not available")) return true;
          const nextDay = e.endDate;
          const hasAdjacentEvent = filteredEvents.some(
            (other) => other !== e && other.startDate === nextDay,
          );
          return !hasAdjacentEvent;
        });

        // Upsert / remove against stored events
        const existing = await db
          .select()
          .from(pmsCalendarEvents)
          .where(
            and(
              eq(pmsCalendarEvents.tenantId, tenantId),
              eq(pmsCalendarEvents.propertyId, propertyId),
              eq(pmsCalendarEvents.platform, link.platform),
            ),
          );

        const existingUIDs = new Set(existing.map((e) => e.icalUid));
        const fetchedUIDs = new Set(futureEvents.map((e) => e.uid));

        const newEvents = futureEvents.filter((e) => !existingUIDs.has(e.uid));

        // Only remove upcoming events — preserve historical bookings even if
        // platforms drop them from feeds after their rolling window expires.
        const removedRows = existing.filter(
          (e) => !fetchedUIDs.has(e.icalUid) && e.endDate >= today,
        );

        for (const event of newEvents) {
          await db
            .insert(pmsCalendarEvents)
            .values({
              tenantId,
              propertyId,
              platform: link.platform,
              icalUid: event.uid,
              summary: event.summary,
              startDate: event.startDate,
              endDate: event.endDate,
            })
            .onConflictDoUpdate({
              target: [pmsCalendarEvents.propertyId, pmsCalendarEvents.platform, pmsCalendarEvents.icalUid],
              set: { summary: event.summary, startDate: event.startDate, endDate: event.endDate, updatedAt: new Date() },
            });
        }

        if (removedRows.length > 0) {
          for (const row of removedRows) {
            await db
              .delete(pmsCalendarEvents)
              .where(
                and(
                  eq(pmsCalendarEvents.id, row.id),
                  eq(pmsCalendarEvents.tenantId, tenantId),
                  gte(pmsCalendarEvents.endDate, today),
                ),
              );
          }
        }

        await db
          .update(pmsIcalChannels)
          .set({ lastSyncedAt: new Date(), lastError: null, failureCount: 0, updatedAt: new Date() })
          .where(eq(pmsIcalChannels.id, link.id));

        summary.newEvents += newEvents.length;
        summary.removedEvents += removedRows.length;
        propertyHadSuccess = true;

        if (newEvents.length > 0) {
          await log(
            db,
            tenantId,
            `${link.name} / ${link.platform}: ${newEvents.length} new event(s) — ${newEvents.map((e) => `${e.summary || "Blocked"} (${e.startDate} → ${e.endDate})`).join(", ")}`,
            "success",
            propertyId,
          );
        }
        if (removedRows.length > 0) {
          await log(db, tenantId, `${link.name} / ${link.platform}: ${removedRows.length} cancelled event(s) removed`, "warn", propertyId);
        }
      } catch (err) {
        summary.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        await log(db, tenantId, `${link.name} / ${link.platform}: Unexpected error — ${msg}`, "error", propertyId);
      }
    }

    if (propertyHadSuccess) summary.propertiesSynced++;
  }

  // Prune oldest sync logs — keep last 1000 per tenant (bulk delete)
  try {
    const cutoff = await db
      .select({ createdAt: pmsSyncLogs.createdAt })
      .from(pmsSyncLogs)
      .where(eq(pmsSyncLogs.tenantId, tenantId))
      .orderBy(desc(pmsSyncLogs.createdAt))
      .limit(1)
      .offset(999);
    if (cutoff.length > 0 && cutoff[0]!.createdAt) {
      await db.delete(pmsSyncLogs).where(
        and(eq(pmsSyncLogs.tenantId, tenantId), lt(pmsSyncLogs.createdAt, cutoff[0]!.createdAt)),
      );
    }
  } catch {
    // non-critical
  }

  await log(
    db,
    tenantId,
    `Sync complete: ${summary.propertiesSynced} properties, ${summary.newEvents} new, ${summary.removedEvents} removed, ${summary.errors} errors`,
    summary.errors > 0 ? "warn" : "success",
  );

  return summary;
}

/** Run iCal sync across all active tenants (called by the worker cron). */
export async function syncAllTenants(db: Db): Promise<void> {
  // Use SECURITY DEFINER function — runs as superuser, bypasses RLS for this
  // single cross-tenant bootstrap query (RLS would otherwise block it).
  const rows = await db.execute(sql`SELECT pms_all_tenant_ids() AS tenant_id`);
  const tenantIds = rows.map((r) => (r as Record<string, unknown>).tenant_id as string).filter(Boolean);

  for (const tenantId of tenantIds) {
    try {
      // Each tenant's sync runs in its own transaction so SET LOCAL is
      // guaranteed on the same connection as the subsequent queries.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL "app.current_tenant_id" = ${tenantId}`);
        await syncCalendars(tx as unknown as Db, { tenantId });
      });
    } catch (err) {
      process.stderr.write(
        JSON.stringify({ level: "error", service: "pms", msg: "ical-sync failed", tenantId, error: err instanceof Error ? err.message : String(err) }) + "\n",
      );
    }
  }
}
