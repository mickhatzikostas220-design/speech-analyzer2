import { NextRequest } from 'next/server';

// Lightweight in-memory fixed-window rate limiter for unauthenticated routes
// (access requests, public inquiries, OAuth callbacks). It throttles abuse
// (email-bombing the admin, DB flooding, brute force) within a warm serverless
// instance. For hard multi-instance guarantees, back this with a shared store
// (e.g. Upstash Redis) — the call sites stay the same.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  Array.from(buckets.entries()).forEach(([key, b]) => {
    if (b.resetAt <= now) buckets.delete(key);
  });
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Returns whether `key` is within `limit` requests per `windowMs`. Increments
 * the counter on each call.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - existing.count, retryAfterSec: 0 };
}

/** Best-effort client IP from the proxy headers Vercel/most hosts set. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
