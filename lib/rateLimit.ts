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
 * Best-effort client IP for rate-limit keys. Prefer `x-real-ip`, which Vercel
 * sets to the real connecting IP — a client can't spoof it. Only fall back to
 * `x-forwarded-for` (whose leftmost entry is client-controlled and easily
 * forged to dodge the limit) when x-real-ip is absent.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return 'unknown';
}
