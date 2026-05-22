import { serve } from "@hono/node-server";
import { createHonoAuthMiddleware, type StockixTokenPayload } from "@repo/auth";
import { apiConfig } from "@repo/config";
import {
  pmsBookings,
  pmsCleaningTasks,
  pmsGuests,
  pmsIcalChannels,
  pmsProperties,
  pmsRooms,
} from "@repo/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "./db.js";
import { buildIcalFeed, generateExportToken } from "./ical/sync.js";
import { startIcalSyncJob } from "./jobs/ical-sync.js";

type PmsEnv = {
  Variables: {
    stockix: StockixTokenPayload;
  };
};

const app = new Hono<PmsEnv>();

app.get("/health", (c) => c.json({ status: "ok", service: "pms" }));

app.get("/api/ical/:token", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const feed = await buildIcalFeed(db, c.req.param("token"));
  if (!feed) return c.json({ error: "not_found" }, 404);
  return c.text(feed, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
  });
});

const productAuth = createHonoAuthMiddleware(apiConfig.authTokenSecret, "pms");

app.use("/api/*", async (c, next) => {
  const internalSecret = process.env.PLATFORM_API_SECRET?.trim();
  const incoming = c.req.header("x-stockix-internal-secret")?.trim();
  const tenantHeader = c.req.header("x-stockix-tenant-id")?.trim();
  if (
    internalSecret
    && incoming
    && incoming === internalSecret
    && tenantHeader
    && z.string().uuid().safeParse(tenantHeader).success
  ) {
    c.set("stockix", {
      userId: "00000000-0000-0000-0000-000000000001",
      tenantId: tenantHeader,
      modules: ["pms"],
      roles: ["admin"],
      planSlug: "operator",
    });
    await next();
    return;
  }
  return productAuth(c, next);
});

function tenantId(c: { get: (k: "stockix") => StockixTokenPayload }) {
  return c.get("stockix").tenantId;
}

app.get("/api/properties", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const rows = await db
    .select()
    .from(pmsProperties)
    .where(eq(pmsProperties.tenantId, tenantId(c)))
    .orderBy(desc(pmsProperties.createdAt));
  return c.json({ properties: rows });
});

app.post("/api/properties", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const body = z
    .object({
      name: z.string().min(1),
      type: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      description: z.string().optional(),
    })
    .parse(await c.req.json());
  const [row] = await db
    .insert(pmsProperties)
    .values({
      tenantId: tenantId(c),
      name: body.name,
      type: body.type ?? "hotel",
      address: body.address,
      city: body.city,
      country: body.country,
      description: body.description,
    })
    .returning();
  return c.json({ property: row }, 201);
});

app.get("/api/properties/:id", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const [row] = await db
    .select()
    .from(pmsProperties)
    .where(
      and(
        eq(pmsProperties.id, c.req.param("id")),
        eq(pmsProperties.tenantId, tenantId(c)),
      ),
    )
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ property: row });
});

app.patch("/api/properties/:id", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const body = z.record(z.unknown()).parse(await c.req.json());
  const [row] = await db
    .update(pmsProperties)
    .set({ ...body, updatedAt: new Date() } as typeof pmsProperties.$inferInsert)
    .where(
      and(
        eq(pmsProperties.id, c.req.param("id")),
        eq(pmsProperties.tenantId, tenantId(c)),
      ),
    )
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ property: row });
});

app.delete("/api/properties/:id", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  await db
    .delete(pmsProperties)
    .where(
      and(
        eq(pmsProperties.id, c.req.param("id")),
        eq(pmsProperties.tenantId, tenantId(c)),
      ),
    );
  return c.json({ ok: true });
});

app.get("/api/properties/:propertyId/rooms", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const rows = await db
    .select()
    .from(pmsRooms)
    .where(
      and(
        eq(pmsRooms.propertyId, c.req.param("propertyId")),
        eq(pmsRooms.tenantId, tenantId(c)),
      ),
    );
  return c.json({ rooms: rows });
});

app.post("/api/properties/:propertyId/rooms", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const body = z
    .object({
      name: z.string().min(1),
      type: z.string().optional(),
      capacity: z.number().int().optional(),
      rateCents: z.number().int().optional(),
    })
    .parse(await c.req.json());
  const [row] = await db
    .insert(pmsRooms)
    .values({
      tenantId: tenantId(c),
      propertyId: c.req.param("propertyId"),
      name: body.name,
      type: body.type ?? "standard",
      capacity: body.capacity ?? 2,
      rateCents: body.rateCents ?? 0,
    })
    .returning();
  return c.json({ room: row }, 201);
});

app.get("/api/bookings", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const rows = await db
    .select()
    .from(pmsBookings)
    .where(eq(pmsBookings.tenantId, tenantId(c)))
    .orderBy(desc(pmsBookings.checkIn));
  return c.json({ bookings: rows });
});

app.post("/api/bookings", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const body = z
    .object({
      propertyId: z.string().uuid(),
      roomId: z.string().uuid(),
      guestId: z.string().uuid(),
      checkIn: z.string(),
      checkOut: z.string(),
      totalAmountCents: z.number().int().optional(),
      notes: z.string().optional(),
    })
    .parse(await c.req.json());
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
      notes: body.notes,
    })
    .returning();
  return c.json({ booking: row }, 201);
});

app.get("/api/bookings/:id", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const [row] = await db
    .select()
    .from(pmsBookings)
    .where(
      and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c))),
    )
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ booking: row });
});

app.patch("/api/bookings/:id", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const body = z.record(z.unknown()).parse(await c.req.json());
  const [row] = await db
    .update(pmsBookings)
    .set({ ...body, updatedAt: new Date() } as typeof pmsBookings.$inferInsert)
    .where(
      and(eq(pmsBookings.id, c.req.param("id")), eq(pmsBookings.tenantId, tenantId(c))),
    )
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ booking: row });
});

app.get("/api/guests", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const rows = await db
    .select()
    .from(pmsGuests)
    .where(eq(pmsGuests.tenantId, tenantId(c)));
  return c.json({ guests: rows });
});

app.post("/api/guests", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const body = z
    .object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
    })
    .parse(await c.req.json());
  const [row] = await db
    .insert(pmsGuests)
    .values({ tenantId: tenantId(c), ...body })
    .returning();
  return c.json({ guest: row }, 201);
});

app.get("/api/channels", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const rows = await db
    .select()
    .from(pmsIcalChannels)
    .where(eq(pmsIcalChannels.tenantId, tenantId(c)));
  return c.json({ channels: rows });
});

app.post("/api/channels", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const body = z
    .object({
      propertyId: z.string().uuid(),
      name: z.string().min(1),
      importUrl: z.string().url().optional(),
    })
    .parse(await c.req.json());
  const [row] = await db
    .insert(pmsIcalChannels)
    .values({
      tenantId: tenantId(c),
      propertyId: body.propertyId,
      name: body.name,
      importUrl: body.importUrl,
      exportToken: generateExportToken(),
    })
    .returning();
  return c.json({ channel: row }, 201);
});

app.delete("/api/channels/:id", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  await db
    .delete(pmsIcalChannels)
    .where(
      and(
        eq(pmsIcalChannels.id, c.req.param("id")),
        eq(pmsIcalChannels.tenantId, tenantId(c)),
      ),
    );
  return c.json({ ok: true });
});

app.get("/api/cleaning", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(pmsCleaningTasks)
    .where(
      and(
        eq(pmsCleaningTasks.tenantId, tenantId(c)),
        eq(pmsCleaningTasks.scheduledDate, date),
      ),
    );
  return c.json({ tasks: rows, date });
});

app.get("/api/reports/occupancy", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const bookings = await db
    .select()
    .from(pmsBookings)
    .where(eq(pmsBookings.tenantId, tenantId(c)));
  const rooms = await db
    .select()
    .from(pmsRooms)
    .where(eq(pmsRooms.tenantId, tenantId(c)));
  const totalRooms = rooms.length;
  const active = bookings.filter((b) => b.bookingStatus === "confirmed").length;
  return c.json({
    totalRooms,
    activeBookings: active,
    occupancyRate: totalRooms > 0 ? active / totalRooms : 0,
  });
});

const port = parseInt(process.env.PMS_PORT ?? "3003", 10);

if (db) {
  startIcalSyncJob(db);
}

serve({ fetch: app.fetch, port });
console.log(`PMS service running on port ${port}`);
