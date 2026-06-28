/**
 * Boot-time environment validation for the POS Backend service.
 * Required at the top of app.js before any other imports.
 * Missing required variables crash the process immediately.
 */
const { z } = require('zod');

const envSchema = z.object({
  // Database
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // Auth secrets
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PLATFORM_JWT_SECRET: z.string().min(32, 'PLATFORM_JWT_SECRET must be at least 32 characters'),
  AUTH_TOKEN_SECRET: z.string().min(32, 'AUTH_TOKEN_SECRET must be at least 32 characters'),
  LICENSE_SIGNING_SECRET: z.string().min(1, 'LICENSE_SIGNING_SECRET is required'),

  // Platform
  POS_PLATFORM_API_KEY: z.string().min(1, 'POS_PLATFORM_API_KEY is required'),
  PLATFORM_API_SECRET: z.string().min(1, 'PLATFORM_API_SECRET is required'),
  INTERNAL_API_SECRET: z.string().min(1, 'INTERNAL_API_SECRET is required'),
  ROOT_DOMAIN: z.string().min(1, 'ROOT_DOMAIN is required'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Optional with safe defaults
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().default('8010'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════╗');
  console.error('║      STOCKIX POS BACKEND — BOOT VALIDATION FAILED      ║');
  console.error('╠════════════════════════════════════════════════════════╣');
  result.error.issues.forEach((issue) => {
    console.error(`║  ✗ ${issue.path.join('.')}: ${issue.message}`);
  });
  console.error('╚════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

module.exports = result.data;
