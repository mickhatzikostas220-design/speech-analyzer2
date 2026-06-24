import { NextRequest } from 'next/server';

/**
 * Best-effort in-memory rate limiter for public, unauthenticated endpoints
 * (access requests, booking inquiries) to blunt floods / email-bombing.
 *
 * Caveat: in a serverless deployment each instance has its own memory, so this
 * is not a hard global limit — it meaningfully slows abuse from a single
 * source but is not a substitute for an edge/WAF limiter at scale. Kept
 * dependency-free on purpose.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Returns true if the caller is within the limit, false if they should be
 * throttled. `limit` requests are allowed per `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 5000) {
      Array.from(buckets.entries()).forEach(([k, b]) => {
        if (b.resetAt < now) buckets.delete(k);
      });
    }
    return true;
  }

  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}
