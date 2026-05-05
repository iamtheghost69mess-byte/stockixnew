type Entry = { count: number; windowStart: number };

const buckets = new Map<string, Entry>();

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function checkRateLimit(key: string): {
  limited: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { limited: false, retryAfterSec: 0 };
  }

  current.count += 1;
  buckets.set(key, current);
  if (current.count <= MAX_ATTEMPTS) {
    return { limited: false, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.ceil((WINDOW_MS - (now - current.windowStart)) / 1000);
  return { limited: true, retryAfterSec: Math.max(retryAfterSec, 1) };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
