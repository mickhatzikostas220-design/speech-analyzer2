import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// AES-256-GCM encryption for OAuth tokens at rest.
//
// Tokens are encrypted before they ever touch the database and are only
// decrypted server-side, immediately before a platform API call. They are
// never selected into any response that reaches the browser.
//
// The key is derived from CLIPFLOW_TOKEN_SECRET (falls back to the Supabase
// service-role key, which is already a server-only secret in this stack).

const STATIC_SALT = 'clipflow.token.v1';

function getKey(): Buffer {
  const secret =
    process.env.CLIPFLOW_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      'CLIPFLOW_TOKEN_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to encrypt platform tokens'
    );
  }
  // Reject weak/short secrets so a low-entropy value can't be used as the
  // encryption key for OAuth tokens at rest.
  if (secret.length < 16) {
    throw new Error('CLIPFLOW_TOKEN_SECRET must be at least 16 characters.');
  }
  return scryptSync(secret, STATIC_SALT, 32);
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: iv | tag | ciphertext, base64-encoded.
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
