import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { pmsStaff, pmsPropertyManagers, pmsPropertyManagerInvites } from "@repo/pms-db/schema";
import { db } from "../db.js";
import { tenantId, errors, parsePagination, listMeta } from "./_utils.js";
import { randomBytes } from "node:crypto";
import type { PmsEnv } from "../types.js";

export const staffRouter = new Hono<PmsEnv>();

// ─── Staff CRUD ───────────────────────────────────────────────────────────────

staffRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsStaff)
    .where(eq(pmsStaff.tenantId, tenantId(c)))
    .orderBy(desc(pmsStaff.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ staff: rows, meta: listMeta(page, limit, rows.length) });
});

staffRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({
    name: z.string().min(1),
    role: z.enum(["receptionist", "manager", "housekeeping", "maintenance"]).optional(),
    email: z.string().email().optional(),
  }).parse(await c.req.json());
  const [row] = await db.insert(pmsStaff).values({ tenantId: tenantId(c), ...body }).returning();
  return c.json({ staff: row }, 201);
});

staffRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db.delete(pmsStaff).where(and(eq(pmsStaff.id, c.req.param("id")), eq(pmsStaff.tenantId, tenantId(c))));
  return c.json({ ok: true });
});

// ─── Property Managers ────────────────────────────────────────────────────────

staffRouter.get("/managers", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const conds = [eq(pmsPropertyManagers.tenantId, tenantId(c))];
  if (propertyId) conds.push(eq(pmsPropertyManagers.propertyId, propertyId));
  const rows = await db.select().from(pmsPropertyManagers).where(and(...conds));
  return c.json({ managers: rows });
});

staffRouter.post("/managers", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({ propertyId: z.string().uuid(), staffId: z.string().uuid() }).parse(await c.req.json());
  const [row] = await db.insert(pmsPropertyManagers).values({
    tenantId: tenantId(c), propertyId: body.propertyId, staffId: body.staffId,
    grantedById: c.get("stockix").userId,
  }).returning();
  return c.json({ manager: row }, 201);
});

staffRouter.delete("/managers/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db.delete(pmsPropertyManagers).where(and(eq(pmsPropertyManagers.id, c.req.param("id")), eq(pmsPropertyManagers.tenantId, tenantId(c))));
  return c.json({ ok: true });
});

// ─── Invites ──────────────────────────────────────────────────────────────────

staffRouter.get("/invites", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const { page, limit, offset } = parsePagination(c);
  const rows = await db
    .select()
    .from(pmsPropertyManagerInvites)
    .where(eq(pmsPropertyManagerInvites.tenantId, tenantId(c)))
    .orderBy(desc(pmsPropertyManagerInvites.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ invites: rows, meta: listMeta(page, limit, rows.length) });
});

staffRouter.post("/invites", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({
    propertyId: z.string().uuid(),
    expiresInDays: z.number().int().min(1).max(90).optional(),
  }).parse(await c.req.json());
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (body.expiresInDays ?? 7));
  const [row] = await db.insert(pmsPropertyManagerInvites).values({
    tenantId: tenantId(c), propertyId: body.propertyId, token,
    createdById: c.get("stockix").userId, expiresAt,
  }).returning();
  return c.json({ invite: row }, 201);
});

// POST /api/staff/invites/:token/accept
staffRouter.post("/invites/:token/accept", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = z.object({ staffId: z.string().uuid() }).parse(await c.req.json());
  const [invite] = await db.select().from(pmsPropertyManagerInvites)
    .where(and(eq(pmsPropertyManagerInvites.token, c.req.param("token")), eq(pmsPropertyManagerInvites.tenantId, tenantId(c)))).limit(1);
  if (!invite) return errors.notFound(c, "invite");
  if (invite.revokedAt) return errors.badRequest(c, "Invite has been revoked");
  if (invite.acceptedAt) return errors.conflict(c, "Invite already accepted");
  if (new Date() > invite.expiresAt) return errors.badRequest(c, "Invite has expired");

  // Accept invite and create property manager
  await db.update(pmsPropertyManagerInvites).set({ acceptedByStaffId: body.staffId, acceptedAt: new Date() }).where(eq(pmsPropertyManagerInvites.id, invite.id));
  const [mgr] = await db.insert(pmsPropertyManagers).values({
    tenantId: tenantId(c), propertyId: invite.propertyId, staffId: body.staffId, grantedById: invite.createdById,
  }).returning();
  return c.json({ manager: mgr });
});

// POST /api/staff/invites/:id/revoke
staffRouter.post("/invites/:id/revoke", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const [row] = await db.update(pmsPropertyManagerInvites).set({ revokedAt: new Date() })
    .where(and(eq(pmsPropertyManagerInvites.id, c.req.param("id")), eq(pmsPropertyManagerInvites.tenantId, tenantId(c)))).returning();
  if (!row) return errors.notFound(c, "invite");
  return c.json({ invite: row });
});
