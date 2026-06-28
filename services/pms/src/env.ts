/**
 * Boot-time environment validation for the PMS service.
 * Imported first in services/pms/src/server.ts.
 */
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth
  AUTH_TOKEN_SECRET: z.string().min(32, 'AUTH_TOKEN_SECRET must be at least 32 characters'),
  PLATFORM_API_SECRET: z.string().min(1, 'PLATFORM_API_SECRET is required'),
  INTERNAL_API_SECRET: z.string().min(1, 'INTERNAL_API_SECRET is required'),

  // Optional with safe defaults
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PMS_PORT: z.string().default('3003'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════╗');
  console.error('║         STOCKIX PMS — BOOT VALIDATION FAILED           ║');
  console.error('╠════════════════════════════════════════════════════════╣');
  result.error.issues.forEach((issue) => {
    console.error(`║  ✗ ${issue.path.join('.')}: ${issue.message}`);
  });
  console.error('╚════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

export const env = result.data;
