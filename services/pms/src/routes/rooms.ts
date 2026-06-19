import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { pmsRooms, pmsProperties } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
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
  const conditions = [eq(pmsRooms.tenantId, tenantId(c)), isNull(pmsRooms.deletedAt)];
  if (propertyId) conditions.push(eq(pmsRooms.propertyId, propertyId));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsRooms)
    .where(and(...conditions))
    .orderBy(desc(pmsRooms.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ rooms: rows, meta: listMeta(page, limit, rows.length) });
});

// POST /api/rooms
roomsRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = createSchema.parse(await c.req.json());
  const tid = tenantId(c);
  const [property] = await db
    .select({ id: pmsProperties.id })
    .from(pmsProperties)
    .where(and(eq(pmsProperties.id, body.propertyId), eq(pmsProperties.tenantId, tid)))
    .limit(1);
  if (!property) return errors.notFound(c, "property");
  const [row] = await db
    .insert(pmsRooms)
    .values({
      tenantId: tid,
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
    .where(and(
      eq(pmsRooms.id, c.req.param("id")),
      eq(pmsRooms.tenantId, tenantId(c)),
      isNull(pmsRooms.deletedAt),
    ))
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
    .where(and(
      eq(pmsRooms.id, c.req.param("id")),
      eq(pmsRooms.tenantId, tenantId(c)),
      isNull(pmsRooms.deletedAt),
    ))
    .returning();
  if (!row) return errors.notFound(c, "room");
  return c.json({ room: row });
});

// DELETE /api/rooms/:id — soft delete
roomsRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .update(pmsRooms)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(pmsRooms.id, c.req.param("id")),
      eq(pmsRooms.tenantId, tenantId(c)),
      isNull(pmsRooms.deletedAt),
    ))
    .returning({ id: pmsRooms.id });
  if (!row) return errors.notFound(c, "room");
  return c.json({ ok: true });
});
