import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { pmsCleaningTasks, pmsCleaners, pmsCleanerAssignments, pmsRooms } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const cleaningRouter = new Hono<PmsEnv>();

// ─── Cleaning Tasks ───────────────────────────────────────────────────────────

cleaningRouter.get("/tasks", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const propertyId = c.req.query("propertyId");
  const conds = [eq(pmsCleaningTasks.tenantId, tenantId(c)), eq(pmsCleaningTasks.scheduledDate, date)];
  if (propertyId) conds.push(eq(pmsCleaningTasks.propertyId, propertyId));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsCleaningTasks)
    .where(and(...conds))
    .orderBy(desc(pmsCleaningTasks.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ tasks: rows, date, meta: listMeta(page, limit, rows.length) });
});

cleaningRouter.post("/tasks", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({
    propertyId: z.string().uuid().optional(), roomId: z.string().uuid(),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cleanerId: z.string().uuid().optional(), notes: z.string().optional(),
  }).parse(await c.req.json());
  const tid = tenantId(c);
  const [room] = await db
    .select({ id: pmsRooms.id, propertyId: pmsRooms.propertyId })
    .from(pmsRooms)
    .where(and(eq(pmsRooms.id, body.roomId), eq(pmsRooms.tenantId, tid)))
    .limit(1);
  if (!room) return errors.notFound(c, "room");
  const [row] = await db.insert(pmsCleaningTasks).values({
    tenantId: tid, propertyId: body.propertyId, roomId: body.roomId,
    scheduledDate: body.scheduledDate, cleanerId: body.cleanerId, notes: body.notes ?? "",
  }).returning();
  return c.json({ task: row }, 201);
});

cleaningRouter.patch("/tasks/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({
    status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
    cleanerId: z.string().uuid().optional(), notes: z.string().optional(),
    photos: z.array(z.string()).optional(),
  }).parse(await c.req.json());
  const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.status === "done") update.doneAt = new Date();
  if (body.photos) update.photos = JSON.stringify(body.photos);
  const [row] = await db.update(pmsCleaningTasks).set(update as typeof pmsCleaningTasks.$inferInsert)
    .where(and(eq(pmsCleaningTasks.id, c.req.param("id")), eq(pmsCleaningTasks.tenantId, tenantId(c)))).returning();
  if (!row) return errors.notFound(c, "cleaning task");
  return c.json({ task: row });
});

// ─── Cleaners ─────────────────────────────────────────────────────────────────

cleaningRouter.get("/cleaners", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsCleaners)
    .where(eq(pmsCleaners.tenantId, tenantId(c)))
    .orderBy(desc(pmsCleaners.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ cleaners: rows, meta: listMeta(page, limit, rows.length) });
});

cleaningRouter.post("/cleaners", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({ name: z.string().min(1), phone: z.string().optional(), email: z.string().email().optional(), notes: z.string().optional() }).parse(await c.req.json());
  const [row] = await db.insert(pmsCleaners).values({ tenantId: tenantId(c), ...body }).returning();
  return c.json({ cleaner: row }, 201);
});

cleaningRouter.patch("/cleaners/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({ name: z.string().min(1).optional(), phone: z.string().optional(), email: z.string().email().optional(), notes: z.string().optional() }).parse(await c.req.json());
  const [row] = await db.update(pmsCleaners).set({ ...body, updatedAt: new Date() })
    .where(and(eq(pmsCleaners.id, c.req.param("id")), eq(pmsCleaners.tenantId, tenantId(c)))).returning();
  if (!row) return errors.notFound(c, "cleaner");
  return c.json({ cleaner: row });
});

cleaningRouter.delete("/cleaners/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db.delete(pmsCleaners).where(and(eq(pmsCleaners.id, c.req.param("id")), eq(pmsCleaners.tenantId, tenantId(c))));
  return c.json({ ok: true });
});

// ─── Cleaner Assignments ──────────────────────────────────────────────────────

cleaningRouter.get("/assignments", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const conds = [eq(pmsCleanerAssignments.tenantId, tenantId(c))];
  if (propertyId) conds.push(eq(pmsCleanerAssignments.propertyId, propertyId));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsCleanerAssignments)
    .where(and(...conds))
    .orderBy(desc(pmsCleanerAssignments.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ assignments: rows, meta: listMeta(page, limit, rows.length) });
});

cleaningRouter.post("/assignments", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({ propertyId: z.string().uuid(), cleanerId: z.string().uuid(), priority: z.number().int().min(0).optional() }).parse(await c.req.json());
  const [row] = await db.insert(pmsCleanerAssignments).values({
    tenantId: tenantId(c), propertyId: body.propertyId, cleanerId: body.cleanerId, priority: body.priority ?? 0,
  }).returning();
  return c.json({ assignment: row }, 201);
});

cleaningRouter.delete("/assignments/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db.delete(pmsCleanerAssignments).where(and(eq(pmsCleanerAssignments.id, c.req.param("id")), eq(pmsCleanerAssignments.tenantId, tenantId(c))));
  return c.json({ ok: true });
});
