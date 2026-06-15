import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { pmsPayments, pmsBookings } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const paymentsRouter = new Hono<PmsEnv>();

const createSchema = z.object({
  bookingId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  method: z.enum(["cash", "card", "bank_transfer", "online", "other"]).optional(),
  status: z.enum(["completed", "pending", "refunded", "failed"]).optional(),
  transactionId: z.string().optional(),
  notes: z.string().optional(),
});

paymentsRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const bookingId = c.req.query("bookingId");
  const conditions = [eq(pmsPayments.tenantId, tenantId(c))];
  if (bookingId) conditions.push(eq(pmsPayments.bookingId, bookingId));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsPayments)
    .where(and(...conditions))
    .orderBy(desc(pmsPayments.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ payments: rows, meta: listMeta(page, limit, rows.length) });
});

paymentsRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = createSchema.parse(await c.req.json());
  const tid = tenantId(c);
  const [booking] = await db
    .select({ id: pmsBookings.id })
    .from(pmsBookings)
    .where(and(eq(pmsBookings.id, body.bookingId), eq(pmsBookings.tenantId, tid)))
    .limit(1);
  if (!booking) return errors.notFound(c, "booking");
  const [row] = await db.insert(pmsPayments).values({
    tenantId: tid, bookingId: body.bookingId, amountCents: body.amountCents,
    method: body.method ?? "cash", status: body.status ?? "completed",
    transactionId: body.transactionId, notes: body.notes,
  }).returning();
  return c.json({ payment: row }, 201);
});

paymentsRouter.get("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db.select().from(pmsPayments)
    .where(and(eq(pmsPayments.id, c.req.param("id")), eq(pmsPayments.tenantId, tenantId(c)))).limit(1);
  if (!row) return errors.notFound(c, "payment");
  return c.json({ payment: row });
});
