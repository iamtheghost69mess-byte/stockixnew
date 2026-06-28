/**
 * Boot-time environment validation for the API service.
 * This file is imported FIRST in apps/api/src/index.ts.
 * If any required variable is missing, the process crashes immediately.
 * This prevents silent runtime failures mid-request.
 */
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth secrets — all required, no fallbacks permitted
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  AUTH_TOKEN_SECRET: z.string().min(32, 'AUTH_TOKEN_SECRET must be at least 32 characters'),
  PLATFORM_JWT_SECRET: z.string().min(32, 'PLATFORM_JWT_SECRET must be at least 32 characters'),
  LICENSE_SIGNING_SECRET: z.string().min(1, 'LICENSE_SIGNING_SECRET is required'),
  DEPLOYMENT_SECRET_KEY: z.string().min(1, 'DEPLOYMENT_SECRET_KEY is required'),

  // Infrastructure
  CONTROL_PLANE_REDIS_URL: z.string().min(1, 'CONTROL_PLANE_REDIS_URL is required'),
  ROOT_DOMAIN: z.string().min(1, 'ROOT_DOMAIN is required'),

  // Internal service secrets
  PLATFORM_API_SECRET: z.string().min(1, 'PLATFORM_API_SECRET is required'),
  INTERNAL_API_SECRET: z.string().min(1, 'INTERNAL_API_SECRET is required'),

  // Optional with safe defaults
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().default('4000'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════╗');
  console.error('║         STOCKIX API — BOOT VALIDATION FAILED           ║');
  console.error('╠════════════════════════════════════════════════════════╣');
  result.error.issues.forEach((issue) => {
    console.error(`║  ✗ ${issue.path.join('.')}: ${issue.message}`);
  });
  console.error('╚════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

export const env = result.data;
