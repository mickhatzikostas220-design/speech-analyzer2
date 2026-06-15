import crypto from 'crypto';

// AES-256-GCM encryption for secrets at rest (BYOK API keys, OAuth tokens).
// The 32-byte key is derived from APP_ENCRYPTION_KEY so any sufficiently long
// secret works. Ciphertext format: ivHex:tagHex:dataHex.

function getKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      'APP_ENCRYPTION_KEY is not set (or too short). Set a long random string in your environment.'
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function isEncryptionConfigured(): boolean {
  const secret = process.env.APP_ENCRYPTION_KEY;
  return !!secret && secret.length >= 16;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid ciphertext');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
