import { randomBytes } from "node:crypto";
import { tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as dbSchema from "@repo/db/schema";

export async function deprovisionChatwootAccount(opts: {
  db: PostgresJsDatabase<typeof dbSchema>;
  tenantId: string;
  chatwootAccountId: string;
  chatwootBaseUrl: string;
  chatwootApiKey: string;
  log: (message: string) => void;
}): Promise<{ success: boolean; error?: string }> {
  const { db, tenantId, chatwootAccountId, chatwootBaseUrl, chatwootApiKey, log } = opts;

  if (!chatwootBaseUrl || !chatwootApiKey) {
    log("[chatwoot] CHATWOOT_BASE_URL or CHATWOOT_API_ACCESS_TOKEN not set; skipping deprovision");
    return { success: true };
  }

  const base = chatwootBaseUrl.replace(/\/$/, "");

  try {
    const res = await fetch(`${base}/platform/api/v1/accounts/${chatwootAccountId}`, {
      method: "DELETE",
      headers: { api_access_token: chatwootApiKey },
    });

    if (res.ok || res.status === 404) {
      await db
        .update(tenants)
        .set({ chatwootAccountId: null })
        .where(eq(tenants.id, tenantId));
      log(`[chatwoot] account ${chatwootAccountId} deleted for tenant ${tenantId}`);
      return { success: true };
    }

    const errorText = await res.text().catch(() => "");
    const error = `HTTP ${res.status}: ${errorText.slice(0, 200)}`;
    log(`[chatwoot] deprovision failed: ${error}`);
    return { success: false, error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log(`[chatwoot] deprovision error: ${error}`);
    return { success: false, error };
  }
}

function generateSecurePassword(): string {
  return randomBytes(18).toString("base64url");
}

export class ChatwootConfigError extends Error {
  readonly code = "CHATWOOT_CONFIG_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ChatwootConfigError";
  }
}

export async function provisionChatwootAccount(opts: {
  db: PostgresJsDatabase<typeof dbSchema>;
  tenantId: string;
  tenantName: string;
  adminEmail: string;
  chatwootBaseUrl: string;
  chatwootApiKey: string;
  log: (message: string) => void;
  /** When true, missing env vars surface as a ChatwootConfigError instead of a silent skip. */
  required?: boolean;
}): Promise<{ accountId: string | null }> {
  const { db, tenantId, tenantName, adminEmail, chatwootBaseUrl, chatwootApiKey, log, required } = opts;

  if (!chatwootBaseUrl || !chatwootApiKey) {
    const msg =
      "[chatwoot] CHATWOOT_BASE_URL or CHATWOOT_API_ACCESS_TOKEN is not configured. " +
      "The 'chat' module was requested but no Chatwoot account will be created. " +
      "Set both env vars in infra/prod/.env and re-provision the chat module.";
    if (required) {
      log(`[chatwoot] ERROR: ${msg}`);
      throw new ChatwootConfigError(msg);
    }
    log(`[chatwoot] ${msg}`);
    return { accountId: null };
  }

  const password = generateSecurePassword();
  const base = chatwootBaseUrl.replace(/\/$/, "");

  try {
    const accountRes = await fetch(`${base}/platform/api/v1/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: chatwootApiKey,
      },
      body: JSON.stringify({
        name: tenantName,
      }),
    });

    let accountId: string | null = null;

    if (accountRes.ok) {
      const accountJson = (await accountRes.json()) as {
        id?: number;
        payload?: { account?: { id?: number } };
      };
      accountId = String(accountJson.id ?? accountJson.payload?.account?.id ?? "");
    } else {
      log(
        `[chatwoot] platform account create failed HTTP ${accountRes.status}; trying sign_up fallback`,
      );
      const signUpRes = await fetch(`${base}/auth/sign_up`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_access_token: chatwootApiKey,
        },
        body: JSON.stringify({
          account_name: tenantName,
          email: adminEmail,
          password,
          confirm_password: password,
        }),
      });
      if (!signUpRes.ok) {
        const text = await signUpRes.text();
        log(`[chatwoot] sign_up failed: HTTP ${signUpRes.status} ${text.slice(0, 200)}`);
        return { accountId: null };
      }
      const signUpJson = (await signUpRes.json()) as {
        data?: { account_id?: number };
      };
      accountId = signUpJson.data?.account_id
        ? String(signUpJson.data.account_id)
        : null;
    }

    if (accountId) {
      await db
        .update(tenants)
        .set({ chatwootAccountId: accountId })
        .where(eq(tenants.id, tenantId));
      log(`[chatwoot] account ${accountId} linked to tenant ${tenantId}`);
    }

    return { accountId };
  } catch (error) {
    log(
      `[chatwoot] provision error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { accountId: null };
  }
}
