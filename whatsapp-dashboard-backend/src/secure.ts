// src/secure.ts — encryption at rest for merchant secrets
// ─────────────────────────────────────────────────────────────
// Uses AES-256-GCM with a master key from .env:
//   TOKEN_ENC_KEY=<64 hex chars>
// Generate one (run once, keep it safe — losing it means stored
// secrets cannot be decrypted):
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// ─────────────────────────────────────────────────────────────
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function masterKey(): Buffer {
  const hex = process.env.TOKEN_ENC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'TOKEN_ENC_KEY missing or invalid in .env (need 64 hex chars). Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
}

// Returns "iv.tag.ciphertext" (base64 parts)
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map(b => b.toString('base64')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map(s => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
