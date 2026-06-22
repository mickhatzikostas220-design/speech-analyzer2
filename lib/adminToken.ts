import { createHmac, timingSafeEqual } from 'crypto';

// No insecure default: these tokens are the ONLY authentication on
// /api/admin/action (approve/deny + invite generation), so a shipped fallback
// secret would let anyone forge them. Fail loudly if it is not configured.
function secret(): string {
  const s = process.env.ADMIN_ACTION_SECRET;
  if (!s) {
    throw new Error('ADMIN_ACTION_SECRET is not set — admin action links are disabled.');
  }
  return s;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function signToken(requestId: string, action: 'approve' | 'deny'): string {
  const payload = Buffer.from(JSON.stringify({ id: requestId, action, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { id: string; action: 'approve' | 'deny' } | null {
  try {
    const [payload, sig] = token.split('.');
    const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
    if (!sig || !safeEqual(sig, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return { id: data.id, action: data.action };
  } catch {
    return null;
  }
}
