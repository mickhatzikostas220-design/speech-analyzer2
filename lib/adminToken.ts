import { createHmac, timingSafeEqual } from 'crypto';

const DEV_FALLBACK = 'fallback-secret-change-me';

// The HMAC key that signs the email approve/deny links. A known/guessable key
// would let anyone forge an "approve" token and grant themselves access, so in
// production we refuse to operate without a real ADMIN_ACTION_SECRET. In dev we
// fall back to a constant so local testing works.
function secret(): string {
  const s = process.env.ADMIN_ACTION_SECRET;
  if (s && s !== DEV_FALLBACK) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_ACTION_SECRET must be set to a strong random value in production.');
  }
  return DEV_FALLBACK;
}

export function signToken(requestId: string, action: 'approve' | 'deny'): string {
  const payload = Buffer.from(JSON.stringify({ id: requestId, action, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { id: string; action: 'approve' | 'deny' } | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
    // Constant-time comparison to avoid leaking the signature via timing.
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return { id: data.id, action: data.action };
  } catch {
    return null;
  }
}
