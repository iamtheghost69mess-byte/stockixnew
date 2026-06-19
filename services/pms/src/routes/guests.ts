import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull, like } from "drizzle-orm";
import { pmsGuests } from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import type { PmsEnv } from "../types.js";
import { encryptGuestPii, decryptGuestPii } from "../lib/pii-crypto.js";

export const guestsRouter = new Hono<PmsEnv>();

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  nationality: z.string().optional(),
  dateOfBirth: z.string().optional(),
  idType: z.enum(["passport", "national_id", "driving_license"]).optional(),
  idNumber: z.string().optional(),
  passportNumber: z.string().optional(),
  passportExpiry: z.string().optional(),
  issuedBy: z.string().optional(),
  visaNumber: z.string().optional(),
  visaFrom: z.string().optional(),
  visaTo: z.string().optional(),
  hasVisa: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

// GET /api/guests?search=...
guestsRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const searchRaw = c.req.query("search");
  const search = searchRaw ? searchRaw.slice(0, 200) : undefined;
  const conditions = [eq(pmsGuests.tenantId, tenantId(c)), isNull(pmsGuests.deletedAt)];
  if (search) conditions.push(like(pmsGuests.name, `%${search}%`));
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsGuests)
    .where(and(...conditions))
    .orderBy(desc(pmsGuests.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ guests: rows.map(decryptGuestPii), meta: listMeta(page, limit, rows.length) });
});

// POST /api/guests
guestsRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = createSchema.parse(await c.req.json());
  const [row] = await db
    .insert(pmsGuests)
    .values({ tenantId: tenantId(c), ...encryptGuestPii(body) })
    .returning();
  return c.json({ guest: decryptGuestPii(row!) }, 201);
});

// GET /api/guests/:id
guestsRouter.get("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .select()
    .from(pmsGuests)
    .where(and(
      eq(pmsGuests.id, c.req.param("id")),
      eq(pmsGuests.tenantId, tenantId(c)),
      isNull(pmsGuests.deletedAt),
    ))
    .limit(1);
  if (!row) return errors.notFound(c, "guest");
  return c.json({ guest: decryptGuestPii(row) });
});

// PATCH /api/guests/:id
guestsRouter.patch("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = updateSchema.parse(await c.req.json());
  const [row] = await db
    .update(pmsGuests)
    .set({ ...encryptGuestPii(body), updatedAt: new Date() } as typeof pmsGuests.$inferInsert)
    .where(and(
      eq(pmsGuests.id, c.req.param("id")),
      eq(pmsGuests.tenantId, tenantId(c)),
      isNull(pmsGuests.deletedAt),
    ))
    .returning();
  if (!row) return errors.notFound(c, "guest");
  return c.json({ guest: decryptGuestPii(row) });
});

// DELETE /api/guests/:id — soft delete
guestsRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db
    .update(pmsGuests)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(pmsGuests.id, c.req.param("id")),
      eq(pmsGuests.tenantId, tenantId(c)),
      isNull(pmsGuests.deletedAt),
    ))
    .returning({ id: pmsGuests.id });
  if (!row) return errors.notFound(c, "guest");
  return c.json({ ok: true });
});
