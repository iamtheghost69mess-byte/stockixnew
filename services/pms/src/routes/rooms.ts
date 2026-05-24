import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { pmsRooms } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const roomsRouter = new Hono<PmsEnv>();

const createSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1),
  type: z.string().optional(),
  capacity: z.number().int().min(1).optional(),
  rateCents: z.number().int().min(0).optional(),
  status: z.enum(["available", "occupied", "maintenance", "cleaning"]).optional(),
  description: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  floor: z.number().int().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  capacity: z.number().int().min(1).optional(),
  rateCents: z.number().int().min(0).optional(),
  status: z.enum(["available", "occupied", "maintenance", "cleaning"]).optional(),
  description: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  floor: z.number().int().nullable().optional(),
});

// GET /api/rooms?propertyId=...
roomsRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const conditions = [eq(pmsRooms.tenantId, tenantId(c))];
  if (propertyId) conditions.push(eq(pmsRooms.propertyId, propertyId));
  const rows = await db.select().from(pmsRooms).where(and(...conditions)).orderBy(desc(pmsRooms.createdAt));
  return c.json({ rooms: rows });
});

// POST /api/rooms
roomsRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = createSchema.parse(await c.req.json());
  const [row] = await db
    .insert(pmsRooms)
    .values({
      tenantId: tenantId(c),
      propertyId: body.propertyId,
      name: body.name,
      type: body.type ?? "standard",
      capacity: body.capacity ?? 2,
      rateCents: body.rateCents ?? 0,
      status: body.status ?? "available",
      description: body.description,
      amenities: JSON.stringify(body.amenities ?? []),
      floor: body.floor,
    })
    .returning();
  return c.json({ room: row }, 201);
});

// GET /api/rooms/:id
roomsRouter.get("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .select()
    .from(pmsRooms)
    .where(and(eq(pmsRooms.id, c.req.param("id")), eq(pmsRooms.tenantId, tenantId(c))))
    .limit(1);
  if (!row) return errors.notFound(c, "room");
  return c.json({ room: row });
});

// PATCH /api/rooms/:id
roomsRouter.patch("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = updateSchema.parse(await c.req.json());
  const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.amenities) update.amenities = JSON.stringify(body.amenities);
  const [row] = await db
    .update(pmsRooms)
    .set(update as typeof pmsRooms.$inferInsert)
    .where(and(eq(pmsRooms.id, c.req.param("id")), eq(pmsRooms.tenantId, tenantId(c))))
    .returning();
  if (!row) return errors.notFound(c, "room");
  return c.json({ room: row });
});

// DELETE /api/rooms/:id
roomsRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db.delete(pmsRooms).where(
    and(eq(pmsRooms.id, c.req.param("id")), eq(pmsRooms.tenantId, tenantId(c))),
  );
  return c.json({ ok: true });
});
