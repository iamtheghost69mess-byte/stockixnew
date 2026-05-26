import { createHonoAuthMiddleware } from "@repo/auth";
import { apiConfig } from "@repo/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError, z } from "zod";
import { db } from "./db.js";
import type { PmsEnv } from "./types.js";
import { startPmsServer } from "./server.js";
import { propertiesRouter } from "./routes/properties.js";
import { roomsRouter } from "./routes/rooms.js";
import { bookingsRouter } from "./routes/bookings.js";
import { guestsRouter } from "./routes/guests.js";
import { paymentsRouter } from "./routes/payments.js";
import { channelsRouter } from "./routes/channels.js";
import { cleaningRouter } from "./routes/cleaning.js";
import { staffRouter } from "./routes/staff.js";
import { reportsRouter } from "./routes/reports.js";
import { calendarRouter } from "./routes/calendar.js";
import { messageTemplatesRouter } from "./routes/message-templates.js";
import { dateOverridesRouter } from "./routes/date-overrides.js";
import { guestFormsRouter } from "./routes/guest-forms.js";

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<PmsEnv>();

// CORS — require explicit allowlist (no wildcard fallback)
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
if (corsOrigins.length === 0) {
  throw new Error(
    "CORS_ALLOWED_ORIGINS must be set. Example: https://dashboard.stockix.cloud,https://stockix.cloud",
  );
}
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return null;
    return corsOrigins.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-stockix-internal-secret", "x-stockix-tenant-id"],
}));

// Health
app.get("/health", (c) => c.json({ status: "ok", service: "pms", timestamp: new Date().toISOString() }));

// ─── Public routes (no auth) ──────────────────────────────────────────────────

app.get("/api/ical/:token", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const { buildIcalFeed } = await import("./ical/sync.js");
  const feed = await buildIcalFeed(db, c.req.param("token"));
  if (!feed) return c.json({ error: "not_found" }, 404);
  return c.text(feed, 200, { "Content-Type": "text/calendar; charset=utf-8" });
});

// Public guest pre-arrival form — token possession is the only auth
app.get("/public/g/:token", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const { pmsGuestFormSubmissions, pmsGuestFormTemplates, pmsBookings, pmsGuests } = await import("@repo/db/schema");
  const { eq } = await import("drizzle-orm");
  const token = c.req.param("token");
  if (!token || token.length < 16) return c.json({ error: "invalid_token" }, 400);

  try {
    const [sub] = await db
      .select()
      .from(pmsGuestFormSubmissions)
      .where(eq(pmsGuestFormSubmissions.shareToken, token))
      .limit(1);
    if (!sub) return c.json({ error: "not_found" }, 404);

    const [tpl] = await db.select().from(pmsGuestFormTemplates).where(eq(pmsGuestFormTemplates.id, sub.templateId)).limit(1);
    const [booking] = await db.select().from(pmsBookings).where(eq(pmsBookings.id, sub.bookingId)).limit(1);
    const guestName = booking
      ? (await db.select({ name: pmsGuests.name }).from(pmsGuests).where(eq(pmsGuests.id, booking.guestId)).limit(1))[0]?.name ?? ""
      : "";

    return c.json({
      alreadySubmitted: !!sub.submittedAt,
      submittedAt: sub.submittedAt,
      templateName: tpl?.name ?? "",
      fields: JSON.parse(tpl?.fields ?? "[]"),
      guestName,
      checkIn: booking?.checkIn,
      checkOut: booking?.checkOut,
    });
  } catch {
    return c.json({ error: "internal_error" }, 500);
  }
});

app.post("/public/g/:token", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const { pmsGuestFormSubmissions, pmsGuestFormTemplates } = await import("@repo/db/schema");
  const { eq } = await import("drizzle-orm");
  const token = c.req.param("token");
  if (!token || token.length < 16) return c.json({ error: "invalid_token" }, 400);

  try {
    const [sub] = await db
      .select()
      .from(pmsGuestFormSubmissions)
      .where(eq(pmsGuestFormSubmissions.shareToken, token))
      .limit(1);
    if (!sub) return c.json({ error: "not_found" }, 404);
    if (sub.submittedAt) return c.json({ error: "already_submitted" }, 409);

    const [tpl] = await db.select().from(pmsGuestFormTemplates).where(eq(pmsGuestFormTemplates.id, sub.templateId)).limit(1);
    if (!tpl) return c.json({ error: "template_not_found" }, 404);

    const body = await c.req.json().catch(() => null);
    const incoming = body?.answers as Record<string, unknown> | undefined;
    if (!incoming) return c.json({ error: "missing_answers" }, 400);

    type FieldDef = { id: string; type: string; label: string; required: boolean };
    const fields: FieldDef[] = JSON.parse(tpl.fields ?? "[]");
    const answers: Array<{ fieldId: string; type: string; label: string; value: unknown }> = [];
    for (const f of fields) {
      const raw = incoming[f.id];
      const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
      if (f.required && empty) return c.json({ error: `Required field: ${f.label || f.id}` }, 400);
      answers.push({ fieldId: f.id, type: f.type, label: f.label, value: empty ? null : raw });
    }

    await db
      .update(pmsGuestFormSubmissions)
      .set({ answers: JSON.stringify(answers), submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmsGuestFormSubmissions.id, sub.id));

    return c.json({ ok: true });
  } catch {
    return c.json({ error: "internal_error" }, 500);
  }
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

const productAuth = createHonoAuthMiddleware(apiConfig.authTokenSecret, "pms");

app.use("/api/*", async (c, next) => {
  // Allow internal platform-to-service calls (worker, control plane API)
  const internalSecret = process.env.PLATFORM_API_SECRET?.trim();
  const incoming = c.req.header("x-stockix-internal-secret")?.trim();
  const tenantHeader = c.req.header("x-stockix-tenant-id")?.trim();
  if (
    internalSecret &&
    incoming &&
    incoming === internalSecret &&
    tenantHeader &&
    z.string().uuid().safeParse(tenantHeader).success
  ) {
    c.set("stockix", {
      userId: "00000000-0000-0000-0000-000000000001",
      tenantId: tenantHeader,
      modules: ["pms"],
      roles: ["admin"],
      planSlug: "operator",
    });
    return next();
  }
  return productAuth(c, next);
});

// ─── Mount route modules ──────────────────────────────────────────────────────

app.route("/api/properties", propertiesRouter);
app.route("/api/rooms", roomsRouter);
app.route("/api/bookings", bookingsRouter);
app.route("/api/guests", guestsRouter);
app.route("/api/payments", paymentsRouter);
app.route("/api/channels", channelsRouter);
app.route("/api/cleaning", cleaningRouter);
app.route("/api/staff", staffRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/calendar", calendarRouter);
app.route("/api/message-templates", messageTemplatesRouter);
app.route("/api/date-overrides", dateOverridesRouter);
app.route("/api/guest-forms", guestFormsRouter);

// ─── Global error handler ─────────────────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: "validation_error", issues: err.issues }, 400);
  }
  console.error("[PMS] Unhandled error:", err);
  return c.json({ error: "internal_server_error" }, 500);
});

// ─── Start ────────────────────────────────────────────────────────────────────

startPmsServer(app, db);
