import { createHmac } from 'crypto';

const secret = () => process.env.ADMIN_ACTION_SECRET ?? 'fallback-secret-change-me';

export function signToken(requestId: string, action: 'approve' | 'deny'): string {
  const payload = Buffer.from(JSON.stringify({ id: requestId, action, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { id: string; action: 'approve' | 'deny' } | null {
  try {
    const [payload, sig] = token.split('.');
    const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return { id: data.id, action: data.action };
  } catch {
    return null;
  }
}
