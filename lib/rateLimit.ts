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

  // Evict expired buckets when the map grows, so a stream of unique keys (e.g.
  // one per IP) can't grow the map without bound between cold starts.
  if (buckets.size > 5000) {
    buckets.forEach((b, k) => {
      if (now > b.resetAt) buckets.delete(k);
    });
  }

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
 * Client IP for rate-limit keys. On Vercel, `x-real-ip` is set by the platform
 * edge to the true client IP and cannot be overridden by the caller, so prefer
 * it. The LEFT-most `x-forwarded-for` value is client-supplied and trivially
 * spoofable (`X-Forwarded-For: <random>` mints a fresh bucket every request),
 * so never key limits on it — fall back to the right-most hop, which is the one
 * appended by the trusted proxy closest to us.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip');
  if (realIp?.trim()) return realIp.trim();

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return 'unknown';
}
