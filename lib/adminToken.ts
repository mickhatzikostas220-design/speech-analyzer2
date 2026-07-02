import { createHmac, timingSafeEqual } from 'crypto';

// HMAC-signed tokens for the one-click approve/deny links emailed to the admin.
// SECURITY: fail closed. If ADMIN_ACTION_SECRET is unset we refuse to sign or
// verify rather than fall back to a hardcoded constant — a known fallback would
// let anyone who submitted an access request forge their own approval link.
const secret = (): string | null => {
  const s = process.env.ADMIN_ACTION_SECRET;
  return s && s.length >= 16 ? s : null;
};

/** True when one-click admin action links can be signed/verified. */
export function adminActionsConfigured(): boolean {
  return secret() !== null;
}

export function signToken(requestId: string, action: 'approve' | 'deny'): string {
  const key = secret();
  if (!key) {
    throw new Error(
      'ADMIN_ACTION_SECRET is not set (needs 16+ chars) — cannot sign admin action links.'
    );
  }
  const payload = Buffer.from(
    JSON.stringify({ id: requestId, action, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  ).toString('base64url');
  const sig = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { id: string; action: 'approve' | 'deny' } | null {
  try {
    const key = secret();
    if (!key) return null; // unconfigured → nothing verifies

    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;

    const expected = createHmac('sha256', key).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    // Constant-time comparison so signatures can't be guessed byte-by-byte.
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.id !== 'string') return null;
    if (data.action !== 'approve' && data.action !== 'deny') return null;
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { id: data.id, action: data.action };
  } catch {
    return null;
  }
}
