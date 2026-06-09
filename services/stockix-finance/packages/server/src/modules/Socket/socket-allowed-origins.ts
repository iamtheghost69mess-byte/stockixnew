function parseOriginUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Resolves browser origins allowed to open Socket.IO connections.
 * Merges SOCKET_ALLOWED_ORIGINS with PUBLIC_BASE_URL / direct local port access.
 */
export function resolveSocketAllowedOrigins(): string[] {
  const origins = new Set<string>();

  for (const entry of (process.env.SOCKET_ALLOWED_ORIGINS ?? '').split(',')) {
    const trimmed = entry.trim();
    if (trimmed) origins.add(trimmed);
  }

  const publicBase = process.env.PUBLIC_BASE_URL?.trim() || process.env.BASE_URL?.trim();
  if (publicBase) {
    origins.add(publicBase);
  }

  const proxyPort = process.env.PUBLIC_PROXY_PORT?.trim();
  if (proxyPort) {
    origins.add(`http://127.0.0.1:${proxyPort}`);
    origins.add(`http://localhost:${proxyPort}`);
    if (publicBase) {
      try {
        const parsed = new URL(publicBase);
        if (parsed.hostname.endsWith('.localhost') || parsed.hostname === 'localhost') {
          origins.add(`${parsed.protocol}//${parsed.hostname}:${proxyPort}`);
        }
      } catch {
        // ignore invalid PUBLIC_BASE_URL
      }
    }
  }

  if (origins.size === 0 && process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:3001');
    origins.add('http://localhost:4000');
  }

  return [...origins];
}

/**
 * True when this tenant stack is configured for browser access (any slug).
 * Loopback and BASE_URL hostnames may use ports that differ from PUBLIC_BASE_URL.
 */
export function isSocketOriginAllowed(
  origin: string | undefined,
  allowed: string[],
): boolean {
  if (!origin) {
    return true;
  }

  const originUrl = parseOriginUrl(origin);
  if (!originUrl) {
    return false;
  }

  for (const allowedOrigin of allowed) {
    const allowedUrl = parseOriginUrl(allowedOrigin);
    if (!allowedUrl) {
      if (origin === allowedOrigin || origin.startsWith(allowedOrigin)) {
        return true;
      }
      continue;
    }
    if (
      originUrl.protocol === allowedUrl.protocol
      && originUrl.host === allowedUrl.host
    ) {
      return true;
    }
  }

  const proxyPort = process.env.PUBLIC_PROXY_PORT?.trim();
  const publicBase = process.env.PUBLIC_BASE_URL?.trim() || process.env.BASE_URL?.trim();
  if (!proxyPort && !publicBase) {
    return false;
  }

  const isLoopback =
    originUrl.hostname === '127.0.0.1' || originUrl.hostname === 'localhost';
  if (isLoopback && proxyPort) {
    return true;
  }

  if (publicBase) {
    const baseUrl = parseOriginUrl(publicBase);
    if (baseUrl && originUrl.hostname === baseUrl.hostname) {
      return true;
    }
  }

  return false;
}
