import { createHonoAuthMiddleware } from "@repo/auth";
import { apiConfig } from "@repo/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
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
// All public routes run inside a transaction so that SET LOCAL for the RLS
// tenant context is guaranteed to apply to every query on the same connection.
// A SECURITY DEFINER function resolves the tenantId from the token — it runs as
// the superuser owner and therefore bypasses RLS for that single bootstrap query.

app.get("/api/ical/:token", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const exportToken = c.req.param("token");
  let feed: string | null = null;

  await db.transaction(async (tx) => {
    // Step 1: resolve tenant via SECURITY DEFINER (bypasses RLS for bootstrap)
    const rows = await tx.execute(
      sql`SELECT pms_tenant_for_export_token(${exportToken}) AS tenant_id`,
    );
    const tenantId = (rows[0] as Record<string, unknown>)?.tenant_id as string | undefined;
    if (!tenantId) return;

    // Step 2: SET LOCAL scopes the RLS context to this transaction connection
    await tx.execute(sql`SET LOCAL "app.current_tenant_id" = ${tenantId}`);

    const { buildIcalFeed } = await import("./ical/sync.js");
    feed = await buildIcalFeed(tx as unknown as NonNullable<typeof db>, exportToken);
  });

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
    type GuestFormPayload = {
      alreadySubmitted: boolean;
      submittedAt: Date | null;
      templateName: string;
      fields: unknown[];
      guestName: string;
      checkIn: string | null | undefined;
      checkOut: string | null | undefined;
    };
    let payload: GuestFormPayload | null = null;

    await db.transaction(async (tx) => {
      // Bootstrap tenant context via SECURITY DEFINER
      const rows = await tx.execute(
        sql`SELECT pms_tenant_for_share_token(${token}) AS tenant_id`,
      );
      const tenantId = (rows[0] as Record<string, unknown>)?.tenant_id as string | undefined;
      if (!tenantId) return;
      await tx.execute(sql`SET LOCAL "app.current_tenant_id" = ${tenantId}`);

      const [sub] = await tx
        .select()
        .from(pmsGuestFormSubmissions)
        .where(eq(pmsGuestFormSubmissions.shareToken, token))
        .limit(1);
      if (!sub) return;

      const [tpl] = await tx.select().from(pmsGuestFormTemplates).where(eq(pmsGuestFormTemplates.id, sub.templateId)).limit(1);
      const [booking] = await tx.select().from(pmsBookings).where(eq(pmsBookings.id, sub.bookingId)).limit(1);
      const guestName = booking
        ? (await tx.select({ name: pmsGuests.name }).from(pmsGuests).where(eq(pmsGuests.id, booking.guestId)).limit(1))[0]?.name ?? ""
        : "";

      payload = {
        alreadySubmitted: !!sub.submittedAt,
        submittedAt: sub.submittedAt,
        templateName: tpl?.name ?? "",
        fields: JSON.parse(tpl?.fields ?? "[]"),
        guestName,
        checkIn: booking?.checkIn,
        checkOut: booking?.checkOut,
      };
    });

    if (!payload) return c.json({ error: "not_found" }, 404);
    return c.json(payload);
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

  const body = await c.req.json().catch(() => null);
  const incoming = body?.answers as Record<string, unknown> | undefined;
  if (!incoming) return c.json({ error: "missing_answers" }, 400);

  try {
    let result: { status: "ok" | "not_found" | "already_submitted" | "template_not_found" | "validation_error"; message?: string } = { status: "not_found" };

    await db.transaction(async (tx) => {
      // Bootstrap tenant context via SECURITY DEFINER
      const rows = await tx.execute(
        sql`SELECT pms_tenant_for_share_token(${token}) AS tenant_id`,
      );
      const tenantId = (rows[0] as Record<string, unknown>)?.tenant_id as string | undefined;
      if (!tenantId) return;
      await tx.execute(sql`SET LOCAL "app.current_tenant_id" = ${tenantId}`);

      const [sub] = await tx
        .select()
        .from(pmsGuestFormSubmissions)
        .where(eq(pmsGuestFormSubmissions.shareToken, token))
        .limit(1);
      if (!sub) return;
      if (sub.submittedAt) { result = { status: "already_submitted" }; return; }

      const [tpl] = await tx.select().from(pmsGuestFormTemplates).where(eq(pmsGuestFormTemplates.id, sub.templateId)).limit(1);
      if (!tpl) { result = { status: "template_not_found" }; return; }

      type FieldDef = { id: string; type: string; label: string; required: boolean };
      const fields: FieldDef[] = JSON.parse(tpl.fields ?? "[]");
      const answers: Array<{ fieldId: string; type: string; label: string; value: unknown }> = [];
      for (const f of fields) {
        const raw = incoming[f.id];
        const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
        if (f.required && empty) {
          result = { status: "validation_error", message: `Required field: ${f.label || f.id}` };
          return;
        }
        answers.push({ fieldId: f.id, type: f.type, label: f.label, value: empty ? null : raw });
      }

      await tx
        .update(pmsGuestFormSubmissions)
        .set({ answers: JSON.stringify(answers), submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(pmsGuestFormSubmissions.id, sub.id));

      result = { status: "ok" };
    });

    if (result.status === "ok") return c.json({ ok: true });
    if (result.status === "already_submitted") return c.json({ error: "already_submitted" }, 409);
    if (result.status === "template_not_found") return c.json({ error: "template_not_found" }, 404);
    if (result.status === "validation_error") return c.json({ error: result.message }, 400);
    return c.json({ error: "not_found" }, 404);
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

// ─── RLS context middleware ───────────────────────────────────────────────────
// Sets app.current_tenant_id on the connection so Postgres RLS policies can
// scope queries to the authenticated tenant. This is a best-effort session
// variable; for strict enforcement configure the app to connect as
// stockix_pms_app (no BYPASSRLS) and use pgBouncer in session mode.

app.use("/api/*", async (c, next) => {
  const tenantId = c.get("stockix")?.tenantId;
  if (tenantId && db) {
    await db.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`);
  }
  await next();
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
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ level: "error", service: "pms", msg: message, ts: new Date().toISOString() }) + "\n");
  return c.json({ error: "internal_server_error" }, 500);
});

// ─── Start ────────────────────────────────────────────────────────────────────

startPmsServer(app, db);
