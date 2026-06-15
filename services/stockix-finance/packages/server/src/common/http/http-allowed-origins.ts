import {
  isSocketOriginAllowed,
  resolveSocketAllowedOrigins,
} from '@/modules/Socket/socket-allowed-origins';

/**
 * Browser origins allowed for HTTP CORS (REST API).
 * Merges CORS_ALLOWED_ORIGINS with socket/PUBLIC_BASE_URL defaults.
 */
export function resolveHttpAllowedOrigins(): string[] {
  const origins = new Set<string>();

  for (const entry of (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',')) {
    const trimmed = entry.trim();
    if (trimmed) origins.add(trimmed);
  }

  for (const origin of resolveSocketAllowedOrigins()) {
    origins.add(origin);
  }

  return [...origins];
}

export const isHttpOriginAllowed = isSocketOriginAllowed;
