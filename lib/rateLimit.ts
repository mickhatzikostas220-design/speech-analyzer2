// Lightweight in-memory rate limiter — best-effort defense-in-depth for
// unauthenticated endpoints (signup, resend). On serverless each instance keeps
// its own map, so this caps abuse per-instance rather than globally; for a hard
// global limit, back it with a shared store (Upstash/Redis or a Supabase table).
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

/**
 * Best-effort client IP for rate-limit keys. Prefer `x-real-ip`, which the
 * platform (Vercel) sets from the actual connection — unlike the *leftmost*
 * `x-forwarded-for` value, which the client fully controls and can rotate to
 * dodge a per-IP cap. When falling back to XFF we take the last hop (appended
 * by the trusted proxy) rather than the first (attacker-supplied).
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return 'unknown';
}
