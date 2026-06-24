import { createHmac, timingSafeEqual } from 'crypto';

// HMAC secret for admin action tokens. These tokens are the *sole* authorization
// for the email approve/deny links (GET /api/admin/action has no session check),
// so a weak/known secret is a full auth bypass. Fail closed if it's unset rather
// than silently falling back to a public constant.
function secret(): string {
  const s = process.env.ADMIN_ACTION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'ADMIN_ACTION_SECRET is missing or too short (need >= 16 chars). Refusing to sign/verify admin tokens with a weak key.'
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
