import { apiConfig } from "@repo/config";
import { tenantDeployments, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Context } from "hono";
import type { Hono } from "hono";
import { z } from "zod";
import * as schema from "@repo/db/schema";
import {
  createFinanceUsersClient,
  type CreateFinanceUserDto,
  type UpdateFinanceUserDto,
} from "./finance-users.client.js";
import { resolveAndPersistFinanceTenantId } from "./finance-tenant-resolve.js";

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

type Db = PostgresJsDatabase<typeof schema>;

const stockixTenantIdParam = z.string().uuid();
const financeUserIdParam = z.coerce.number().int().positive();

const createUserBody = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  password: z.string().min(8).max(256),
  roleId: z.coerce.number().int().positive(),
});

const updateUserBody = z
  .object({
    roleId: z.coerce.number().int().positive().optional(),
    isActive: z.boolean().optional(),
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
  })
  .strip();

const resetPasswordBody = z.object({
  newPassword: z.string().min(8).max(256),
});

type TenantFinanceUsersContext = {
  financeTenantId: number;
  client: ReturnType<typeof createFinanceUsersClient>;
};

function internalBaseUrlFromPort(internalPort: number): string {
  return `http://${apiConfig.tenantInternalHost}:${internalPort}`;
}

async function resolveTenantFinanceUsersContext(
  db: Db,
  stockixTenantId: string,
): Promise<TenantFinanceUsersContext | { error: string; status: number; message?: string }> {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    return {
      error: "internal_api_secret_not_configured",
      status: 503,
      message: "INTERNAL_API_SECRET is not configured",
    };
  }

  const [row] = await db
    .select({
      tenantId: tenants.id,
      financeTenantId: tenantDeployments.financeTenantId,
      internalPort: tenantDeployments.internalPort,
      deploymentStatus: tenantDeployments.status,
    })
    .from(tenants)
    .leftJoin(tenantDeployments, eq(tenantDeployments.tenantId, tenants.id))
    .where(eq(tenants.id, stockixTenantId))
    .limit(1);

  if (!row) {
    return { error: "tenant_not_found", status: 404 };
  }

  const port = row.internalPort == null ? null : Number(row.internalPort);
  if (port == null || Number.isNaN(port) || port <= 0) {
    return {
      error: "tenant_no_internal_url",
      status: 503,
      message: "Tenant deployment has no internal port",
    };
  }

  let financeTenantId = row.financeTenantId == null ? null : Number(row.financeTenantId);
  if (financeTenantId == null || !Number.isFinite(financeTenantId) || financeTenantId <= 0) {
    const repaired = await resolveAndPersistFinanceTenantId(db, stockixTenantId);
    if (repaired.ok) {
      financeTenantId = repaired.financeTenantId;
    } else {
      return {
        error: "finance_tenant_not_linked",
        status: 503,
        message:
          "Finance tenant id is not set for this deployment. Re-provision the accounting stack or ensure the Finance API is reachable.",
      };
    }
  }

  const internalBaseUrl = internalBaseUrlFromPort(port);
  const client = createFinanceUsersClient(internalBaseUrl);

  return { financeTenantId, client };
}

function mapFinanceUsersError(err: unknown): { status: number; body: Record<string, unknown> } {
  const message = err instanceof Error ? err.message : String(err);
  const statusMatch = message.match(/failed: (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : 502;
  return {
    status: status >= 400 && status < 600 ? status : 502,
    body: {
      error: "finance_users_proxy_failed",
      message,
    },
  };
}

async function withFinanceUsersContext(
  c: Context<ApiEnv>,
  db: Db,
  stockixTenantId: string,
  handler: (ctx: TenantFinanceUsersContext) => Promise<Response>,
): Promise<Response> {
  const resolved = await resolveTenantFinanceUsersContext(db, stockixTenantId);
  if ("error" in resolved) {
    return c.json(
      {
        error: resolved.error,
        ...(resolved.message ? { message: resolved.message } : {}),
      },
      resolved.status as 404 | 503,
    );
  }
  try {
    return await handler(resolved);
  } catch (err) {
    const mapped = mapFinanceUsersError(err);
    return c.json(mapped.body, mapped.status as 502);
  }
}

export function registerTenantFinanceUsersApi(app: Hono<ApiEnv>, db: Db | null): void {
  app.post("/tenants/:tenantId/repair-finance-link", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    const result = await resolveAndPersistFinanceTenantId(db, tenantParsed.data);
    if (!result.ok) {
      const status =
        result.error === "tenant_not_found"
          ? 404
          : result.error === "tenant_no_internal_port"
            ? 503
            : 503;
      return c.json(
        {
          error: result.error,
          message:
            result.error === "finance_resolve_failed"
              ? "Could not resolve Finance tenant from the live stack. Ensure the tenant containers are running and INTERNAL_API_SECRET matches Finance."
              : undefined,
        },
        status as 404 | 503,
      );
    }

    return c.json({
      financeTenantId: result.financeTenantId,
      organizationId: result.organizationId,
      source: result.source,
    });
  });

  app.get("/tenants/:tenantId/users", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    return withFinanceUsersContext(c, db, tenantParsed.data, async (ctx) => {
      const result = await ctx.client.listUsers(ctx.financeTenantId);
      return c.json(result);
    });
  });

  app.post("/tenants/:tenantId/users", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }

    let body: z.infer<typeof createUserBody>;
    try {
      body = createUserBody.parse(await c.req.json());
    } catch (e) {
      return c.json(
        {
          error: "invalid_body",
          detail: e instanceof z.ZodError ? e.flatten() : String(e),
        },
        400,
      );
    }

    const payload: CreateFinanceUserDto = {
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      password: body.password,
      roleId: body.roleId,
    };

    return withFinanceUsersContext(c, db, tenantParsed.data, async (ctx) => {
      const result = await ctx.client.createUser(ctx.financeTenantId, payload);
      return c.json(result, 201);
    });
  });

  app.patch("/tenants/:tenantId/users/:userId", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }
    const userParsed = financeUserIdParam.safeParse(c.req.param("userId"));
    if (!userParsed.success) {
      return c.json({ error: "userId must be a positive integer" }, 400);
    }

    let body: z.infer<typeof updateUserBody>;
    try {
      body = updateUserBody.parse(await c.req.json());
    } catch (e) {
      return c.json(
        {
          error: "invalid_body",
          detail: e instanceof z.ZodError ? e.flatten() : String(e),
        },
        400,
      );
    }

    const payload: UpdateFinanceUserDto = body;

    return withFinanceUsersContext(c, db, tenantParsed.data, async (ctx) => {
      const result = await ctx.client.updateUser(
        ctx.financeTenantId,
        userParsed.data,
        payload,
      );
      return c.json(result);
    });
  });

  app.delete("/tenants/:tenantId/users/:userId", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }
    const userParsed = financeUserIdParam.safeParse(c.req.param("userId"));
    if (!userParsed.success) {
      return c.json({ error: "userId must be a positive integer" }, 400);
    }

    return withFinanceUsersContext(c, db, tenantParsed.data, async (ctx) => {
      const result = await ctx.client.deleteUser(ctx.financeTenantId, userParsed.data);
      return c.json(result);
    });
  });

  app.post("/tenants/:tenantId/users/:userId/reset-password", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }
    const userParsed = financeUserIdParam.safeParse(c.req.param("userId"));
    if (!userParsed.success) {
      return c.json({ error: "userId must be a positive integer" }, 400);
    }

    let body: z.infer<typeof resetPasswordBody>;
    try {
      body = resetPasswordBody.parse(await c.req.json());
    } catch (e) {
      return c.json(
        {
          error: "invalid_body",
          detail: e instanceof z.ZodError ? e.flatten() : String(e),
        },
        400,
      );
    }

    return withFinanceUsersContext(c, db, tenantParsed.data, async (ctx) => {
      const result = await ctx.client.resetPassword(
        ctx.financeTenantId,
        userParsed.data,
        body.newPassword,
      );
      return c.json(result);
    });
  });

  app.post("/tenants/:tenantId/users/:userId/suspend", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }
    const userParsed = financeUserIdParam.safeParse(c.req.param("userId"));
    if (!userParsed.success) {
      return c.json({ error: "userId must be a positive integer" }, 400);
    }

    return withFinanceUsersContext(c, db, tenantParsed.data, async (ctx) => {
      const result = await ctx.client.suspendUser(ctx.financeTenantId, userParsed.data);
      return c.json(result);
    });
  });

  app.post("/tenants/:tenantId/users/:userId/activate", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);
    const tenantParsed = stockixTenantIdParam.safeParse(c.req.param("tenantId"));
    if (!tenantParsed.success) {
      return c.json({ error: "tenantId must be a UUID" }, 400);
    }
    const userParsed = financeUserIdParam.safeParse(c.req.param("userId"));
    if (!userParsed.success) {
      return c.json({ error: "userId must be a positive integer" }, 400);
    }

    return withFinanceUsersContext(c, db, tenantParsed.data, async (ctx) => {
      const result = await ctx.client.activateUser(ctx.financeTenantId, userParsed.data);
      return c.json(result);
    });
  });
}
