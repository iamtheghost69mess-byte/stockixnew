/**
 * Boot-time environment validation for the Infra Worker service.
 * Imported first in worker.ts.
 */
import { z } from 'zod';

const envSchema = z.object({
  // Control plane database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Critical secrets
  DEPLOYMENT_SECRET_KEY: z.string().min(1, 'DEPLOYMENT_SECRET_KEY is required'),
  AUTH_TOKEN_SECRET: z.string().min(32, 'AUTH_TOKEN_SECRET must be at least 32 characters'),
  LICENSE_SIGNING_SECRET: z.string().min(1, 'LICENSE_SIGNING_SECRET is required'),
  PLATFORM_JWT_SECRET: z.string().min(32, 'PLATFORM_JWT_SECRET must be at least 32 characters'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  WORKER_SECRET: z.string().min(1, 'WORKER_SECRET is required'),

  // Infrastructure paths
  TENANT_ENV_ROOT: z.string().min(1, 'TENANT_ENV_ROOT is required'),
  TRAEFIK_DYNAMIC_DIR: z.string().min(1, 'TRAEFIK_DYNAMIC_DIR is required'),
  STOCKIX_TENANT_APP_ROOT: z.string().min(1, 'STOCKIX_TENANT_APP_ROOT is required'),

  // Shared services — must be Docker DNS names, not localhost
  WORKER_SHARED_MYSQL_HOST: z.string()
    .min(1, 'WORKER_SHARED_MYSQL_HOST is required')
    .refine(
      (val) => val !== 'localhost' && val !== '127.0.0.1',
      'WORKER_SHARED_MYSQL_HOST must be a Docker service name, not localhost or 127.0.0.1'
    ),
  MYSQL_PROXY_HOST: z.string()
    .min(1, 'MYSQL_PROXY_HOST is required')
    .refine(
      (val) => val !== 'localhost' && val !== '127.0.0.1',
      'MYSQL_PROXY_HOST must be a Docker service name (e.g. stockix-mysql-proxy)'
    ),

  // Redis
  CONTROL_PLANE_REDIS_URL: z.string().min(1, 'CONTROL_PLANE_REDIS_URL is required'),

  // Root domain
  ROOT_DOMAIN: z.string().min(1, 'ROOT_DOMAIN is required'),

  // Optional with safe defaults
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  WORKER_CONCURRENCY: z.string().default('3'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════╗');
  console.error('║      STOCKIX WORKER — BOOT VALIDATION FAILED           ║');
  console.error('╠════════════════════════════════════════════════════════╣');
  result.error.issues.forEach((issue) => {
    console.error(`║  ✗ ${issue.path.join('.')}: ${issue.message}`);
  });
  console.error('╚════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

export const env = result.data;
