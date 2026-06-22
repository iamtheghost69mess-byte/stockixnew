import { jwtVerify, SignJWT } from "jose";

export type StockixModule =
  | "accounting"
  | "pos"
  | "pms"
  | "chat";

export type StockixRole =
  | "admin"
  | "manager"
  | "accountant"
  | "cashier"
  | "cleaner"
  | "receptionist";

export interface StockixTokenPayload {
  userId: string;
  tenantId: string;
  organizationId?: string;
  modules: StockixModule[];
  roles: StockixRole[];
  planSlug: string;
  iat?: number;
  exp?: number;
}

export interface StockixRefreshTokenPayload {
  userId: string;
  tenantId: string;
  type: "refresh";
  iat?: number;
  exp?: number;
}

export async function verifyStockixToken(
  token: string,
  secret: string,
): Promise<StockixTokenPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  return payload as unknown as StockixTokenPayload;
}

export function hasModule(
  payload: StockixTokenPayload,
  module: StockixModule,
): boolean {
  return payload.modules.includes(module);
}

export function requireModule(
  payload: StockixTokenPayload,
  module: StockixModule,
): void {
  if (!hasModule(payload, module)) {
    throw new Error(`Module not licensed: ${module}`);
  }
}

export function hasRole(
  payload: StockixTokenPayload,
  role: StockixRole,
): boolean {
  return payload.roles.includes(role);
}

export async function signStockixToken(
  payload: Omit<StockixTokenPayload, "iat" | "exp">,
  secret: string,
  expiresIn: string = "8h",
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function signStockixRefreshToken(
  payload: Omit<StockixRefreshTokenPayload, "iat" | "exp" | "type">,
  secret: string,
  expiresIn: string = "7d",
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ ...payload, type: "refresh" } as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyStockixRefreshToken(
  token: string,
  secret: string,
): Promise<StockixRefreshTokenPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return payload as unknown as StockixRefreshTokenPayload;
}

export function createExpressAuthMiddleware(
  secret: string,
  requiredModule?: StockixModule,
  validateTokenFn?: (token: string) => Promise<boolean>
) {
  return async (req: {
    headers: { authorization?: string };
    cookies?: { "stockix-session"?: string };
    stockix?: StockixTokenPayload;
  }, res: {
    status: (code: number) => { json: (body: unknown) => void };
  }, next: () => void) => {
    try {
      const header = req.headers.authorization ?? "";
      const cookieToken = req.cookies?.["stockix-session"];
      const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : cookieToken;

      if (!token) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      const payload = await verifyStockixToken(token, secret);

      if (requiredModule && !hasModule(payload, requiredModule)) {
        res.status(403).json({
          error: "module_not_licensed",
          module: requiredModule,
        });
        return;
      }

      if (validateTokenFn) {
        const isValid = await validateTokenFn(token);
        if (!isValid) {
          res.status(401).json({ error: "token_revoked" });
          return;
        }
      }

      req.stockix = payload;
      next();
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}

export function createHonoAuthMiddleware(
  secret: string,
  requiredModule?: StockixModule,
  validateTokenFn?: (token: string) => Promise<boolean>
) {
  return async (c: {
    req: {
      header: (name: string) => string | undefined;
    };
    json: (body: unknown, status?: number) => Response;
    set: (key: string, value: StockixTokenPayload) => void;
  }, next: () => Promise<void>) => {
    try {
      const header = c.req.header("authorization") ?? "";
      const cookieHeader = c.req.header("cookie") ?? "";
      const cookieToken = cookieHeader
        .split(";")
        .find((s: string) => s.trim().startsWith("stockix-session="))
        ?.split("=")[1];

      const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : cookieToken;

      if (!token) {
        return c.json({ error: "unauthorized" }, 401);
      }

      const payload = await verifyStockixToken(token, secret);

      if (requiredModule && !hasModule(payload, requiredModule)) {
        return c.json({
          error: "module_not_licensed",
          module: requiredModule,
        }, 403);
      }

      if (validateTokenFn) {
        const isValid = await validateTokenFn(token);
        if (!isValid) {
          return c.json({ error: "token_revoked" }, 401);
        }
      }

      c.set("stockix", payload);
      await next();
    } catch {
      return c.json({ error: "invalid_token" }, 401);
    }
  };
}

export function createNestGuard(
  secret: string,
  requiredModule?: StockixModule,
  validateTokenFn?: (token: string) => Promise<boolean>
) {
  return class StockixAuthGuard {
    async canActivate(context: {
      switchToHttp: () => {
        getRequest: () => {
          headers: { authorization?: string };
          cookies?: { "stockix-session"?: string };
          stockix?: StockixTokenPayload;
        };
      };
    }): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const header = request.headers.authorization ?? "";
      const cookieToken = request.cookies?.["stockix-session"];
      const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : cookieToken;

      if (!token) return false;

      try {
        const payload = await verifyStockixToken(token, secret);
        if (requiredModule && !hasModule(payload, requiredModule)) {
          return false;
        }
        if (validateTokenFn) {
          const isValid = await validateTokenFn(token);
          if (!isValid) return false;
        }
        request.stockix = payload;
        return true;
      } catch {
        return false;
      }
    }
  };
}
