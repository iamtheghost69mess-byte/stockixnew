/**
 * Boot-time environment validation for the Finance (Bigcapital) service.
 * Imported first in main.ts.
 */
import { z } from 'zod';

const envSchema = z.object({
  // System database — required
  SYSTEM_DB_HOST: z.string().min(1, 'SYSTEM_DB_HOST is required (use stockix-mysql-proxy in Swarm)'),
  SYSTEM_DB_USER: z.string().min(1, 'SYSTEM_DB_USER is required'),
  SYSTEM_DB_PASSWORD: z.string().min(1, 'SYSTEM_DB_PASSWORD is required'),
  SYSTEM_DB_NAME: z.string().min(1, 'SYSTEM_DB_NAME is required'),

  // Tenant database — required
  TENANT_DB_HOST: z.string().min(1, 'TENANT_DB_HOST is required (use stockix-mysql-proxy in Swarm)'),
  TENANT_DB_USER: z.string().min(1, 'TENANT_DB_USER is required'),
  TENANT_DB_PASSWORD: z.string().min(1, 'TENANT_DB_PASSWORD is required'),

  // Redis — required, no localhost fallback permitted
  REDIS_HOST: z.string()
    .min(1, 'REDIS_HOST is required')
    .refine(
      (val) => val !== 'localhost' && val !== '127.0.0.1',
      'REDIS_HOST must be a Docker service name (e.g. stockix-redis), not localhost'
    ),

  // Queue — required, no localhost fallback permitted  
  QUEUE_HOST: z.string()
    .min(1, 'QUEUE_HOST is required')
    .refine(
      (val) => val !== 'localhost' && val !== '127.0.0.1',
      'QUEUE_HOST must be a Docker service name (e.g. stockix-redis), not localhost'
    ),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // Internal secret
  INTERNAL_API_SECRET: z.string().min(1, 'INTERNAL_API_SECRET is required'),

  // Optional with safe defaults
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().default('3000'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════╗');
  console.error('║      STOCKIX FINANCE — BOOT VALIDATION FAILED          ║');
  console.error('╠════════════════════════════════════════════════════════╣');
  result.error.issues.forEach((issue) => {
    console.error(`║  ✗ ${issue.path.join('.')}: ${issue.message}`);
  });
  console.error('╚════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

export const env = result.data;
