import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encrypts small secrets (two-step verification keys) before they reach the database, so a leaked
 * dump doesn't hand out working authenticator secrets. AES-256-GCM with a key derived from
 * JWT_ACCESS_SECRET: rotating that secret makes stored keys unreadable, and two-step verification
 * then has to be set up again.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(masterSecret: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', masterSecret, 'codeqlick', 'two-factor-secret-v1', 32),
    );
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  /** Throws when the value was tampered with or sealed with another key. */
  open(sealed: string): string {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unknown format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
