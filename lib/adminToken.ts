import { createHmac, timingSafeEqual } from 'crypto';

// The HMAC secret protects the email approve/deny links in the admin flow.
// There is intentionally NO fallback: a hardcoded default would let anyone
// forge a valid "approve" token and self-grant access. Fail closed instead.
function secret(): string {
  const s = process.env.ADMIN_ACTION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'ADMIN_ACTION_SECRET is not set (or too short). Set a long random string to sign admin action links.'
    );
  }
  return s;
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
    // Constant-time comparison to avoid leaking the signature byte-by-byte.
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
