import type { createDb } from "@repo/db";
import type { Hono } from "hono";

import { registerResendWebhook } from "./webhooks/resend.js";

type Db = ReturnType<typeof createDb>;

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    actorEffectiveRole?: string;
    actorPermissions?: string[];
    apiKeyId?: string;
    requestId: string;
    requestStartMs: number;
  };
};

/** Registers all `/webhooks/*` handlers (Resend delivery events today). */
export function registerWebhooks(app: Hono<ApiEnv>, db: Db | null): void {
  registerResendWebhook(app, db);
}
