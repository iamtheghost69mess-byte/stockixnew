import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createPlatformAuthGate } from "../src/middleware/auth.js";

describe("createPlatformAuthGate", () => {
  it("allows POST /webhooks/resend without Authorization header", async () => {
    const app = new Hono();
    app.use("/*", createPlatformAuthGate("platform-secret", "worker-secret"));
    app.post("/webhooks/resend", (c) => c.json({ ok: true }));

    const res = await app.request("/webhooks/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email.delivered", data: { email_id: "x" } }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("still requires platform secret for protected routes", async () => {
    const app = new Hono();
    app.use("/*", createPlatformAuthGate("platform-secret", "worker-secret"));
    app.get("/tenants", (c) => c.json({ ok: true }));

    const res = await app.request("/tenants", { method: "GET" });
    expect(res.status).toBe(401);
  });
});
