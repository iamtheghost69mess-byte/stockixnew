import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  pmsGuestFormTemplates,
  pmsGuestFormSubmissions,
  pmsBookings,
} from "@repo/db/schema";
import { db } from "../db.js";
import { tenantId, errors } from "./_utils.js";
import type { PmsEnv } from "../types.js";

export const guestFormsRouter = new Hono<PmsEnv>();

function mintToken(): string {
  return randomBytes(24).toString("base64url");
}

const templateSchema = z.object({
  propertyId: z.string().uuid().optional(),
  name: z.string().min(1),
  fields: z.string().default("[]"), // JSON array of field defs
});

// ─── Templates ───────────────────────────────────────────────────────────────

guestFormsRouter.get("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const propertyId = c.req.query("propertyId");
  const conds = [eq(pmsGuestFormTemplates.tenantId, tenantId(c))];
  if (propertyId) conds.push(eq(pmsGuestFormTemplates.propertyId, propertyId));
  const rows = await db.select().from(pmsGuestFormTemplates).where(and(...conds));
  return c.json({ templates: rows });
});

guestFormsRouter.post("/", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = templateSchema.parse(await c.req.json());
  const [row] = await db
    .insert(pmsGuestFormTemplates)
    .values({ tenantId: tenantId(c), ...body })
    .returning();
  return c.json({ template: row }, 201);
});

guestFormsRouter.patch("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const body = templateSchema.partial().parse(await c.req.json());
  const [row] = await db
    .update(pmsGuestFormTemplates)
    .set({ ...body, updatedAt: new Date() })
    .where(
      and(
        eq(pmsGuestFormTemplates.id, c.req.param("id")),
        eq(pmsGuestFormTemplates.tenantId, tenantId(c)),
      ),
    )
    .returning();
  if (!row) return errors.notFound(c, "template");
  return c.json({ template: row });
});

guestFormsRouter.delete("/:id", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  await db
    .delete(pmsGuestFormTemplates)
    .where(
      and(
        eq(pmsGuestFormTemplates.id, c.req.param("id")),
        eq(pmsGuestFormTemplates.tenantId, tenantId(c)),
      ),
    );
  return c.json({ ok: true });
});

// ─── Booking share link ───────────────────────────────────────────────────────

// GET /api/guest-forms/booking/:bookingId — check submission status
guestFormsRouter.get("/booking/:bookingId", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const bookingId = c.req.param("bookingId");
  const [booking] = await db
    .select()
    .from(pmsBookings)
    .where(and(eq(pmsBookings.id, bookingId), eq(pmsBookings.tenantId, tenantId(c))))
    .limit(1);
  if (!booking) return errors.notFound(c, "booking");

  const [submission] = await db
    .select()
    .from(pmsGuestFormSubmissions)
    .where(eq(pmsGuestFormSubmissions.bookingId, bookingId))
    .limit(1);

  if (!submission) return c.json({ submission: null });
  return c.json({
    submission: {
      id: submission.id,
      shareToken: submission.shareToken,
      submittedAt: submission.submittedAt,
      answers: submission.submittedAt ? submission.answers : null,
    },
  });
});

// POST /api/guest-forms/booking/:bookingId/share — find-or-create submission token
guestFormsRouter.post("/booking/:bookingId/share", async (c) => {
  if (!db) return errors.dbUnavailable(c);
  const bookingId = c.req.param("bookingId");
  const tid = tenantId(c);

  const [booking] = await db
    .select()
    .from(pmsBookings)
    .where(and(eq(pmsBookings.id, bookingId), eq(pmsBookings.tenantId, tid)))
    .limit(1);
  if (!booking) return errors.notFound(c, "booking");

  // Find the first template for this property (or tenant-wide)
  const [template] = await db
    .select()
    .from(pmsGuestFormTemplates)
    .where(
      and(
        eq(pmsGuestFormTemplates.tenantId, tid),
        eq(pmsGuestFormTemplates.propertyId, booking.propertyId),
      ),
    )
    .limit(1);
  if (!template) {
    return c.json({ error: "No guest form template configured for this property" }, 400);
  }

  // Idempotent: return existing submission rather than creating duplicates
  const [existing] = await db
    .select()
    .from(pmsGuestFormSubmissions)
    .where(
      and(
        eq(pmsGuestFormSubmissions.bookingId, bookingId),
        eq(pmsGuestFormSubmissions.templateId, template.id),
        eq(pmsGuestFormSubmissions.tenantId, tid),
      ),
    )
    .limit(1);

  const newSub = existing
    ? null
    : (await db
        .insert(pmsGuestFormSubmissions)
        .values({ tenantId: tid, bookingId, templateId: template.id, shareToken: mintToken() })
        .returning())[0] ?? null;
  const submission = existing ?? newSub;
  if (!submission) return c.json({ error: "failed_to_create_submission" }, 500);

  return c.json({
    shareToken: submission.shareToken,
    submittedAt: submission.submittedAt,
  });
});
