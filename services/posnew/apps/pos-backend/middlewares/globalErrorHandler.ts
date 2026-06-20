import { Request, Response, NextFunction } from "express";
const config = require("../config/config");
const { captureError } = require("../services/observability");

function wantsProblemJson(req: Request) {
  const url = req.originalUrl || req.url || "";
  const acc = req.get("Accept") || "";
  return (
    url.startsWith("/api/platform/v1") ||
    acc.includes("application/problem+json")
  );
}

const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (statusCode >= 500) {
    captureError(err, {
      requestId: res.locals?.requestId,
      organizationId: (req as any)?.tenantOrganizationId || (req as any)?.user?.organization,
    });
  }

  if (typeof (res as any).problem === "function" && wantsProblemJson(req)) {
    const ext: any = {
      requestId: res?.locals?.requestId,
    };
    if (err.code) {
      ext.code = err.code;
    }
    if (config.nodeEnv === "development" && err.stack) {
      ext.stack = err.stack;
    }
    return (res as any).problem(
      statusCode,
      err.type || "about:blank",
      message,
      message,
      ext
    );
  }

  const body: any = {
    success: false,
    message,
    requestId: res?.locals?.requestId,
    error: config.nodeEnv === "development" ? err.stack : undefined,
  };
  if (err.code) body.code = err.code;
  if (err.redirect) body.redirect = err.redirect;
  return res.status(statusCode).json(body);
};

export = globalErrorHandler;
