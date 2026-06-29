import { createHmac, timingSafeEqual } from 'crypto';

// HMAC-signed token used for the one-click approve/deny links emailed to the
// admin. These links carry no session, so the signature IS the authorization —
// the signing secret must be a real, private value. We deliberately do NOT
// provide a fallback: a hardcoded default would let anyone forge approve/deny
// tokens. Set ADMIN_ACTION_SECRET (e.g. `openssl rand -hex 32`) in the env.
function secret(): string {
  const s = process.env.ADMIN_ACTION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'ADMIN_ACTION_SECRET is not set (or too short). Set a long random string in your environment.'
    );
  }
  return s;
}

type Action = 'approve' | 'deny';

export function signToken(requestId: string, action: Action): string {
  const payload = Buffer.from(
    JSON.stringify({ id: requestId, action, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  ).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { id: string; action: Action } | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;

    const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    // Constant-time comparison; length must match first (timingSafeEqual throws otherwise).
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    // Validate the decoded structure rather than trusting it.
    if (typeof data.id !== 'string') return null;
    if (data.action !== 'approve' && data.action !== 'deny') return null;
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;

    return { id: data.id, action: data.action };
  } catch {
    return null;
  }
}
