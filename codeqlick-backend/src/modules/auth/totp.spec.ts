import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box.js';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  verifyTotp,
} from './totp.js';

// RFC 6238 appendix B: the SHA-1 seed is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(totpCode(RFC_SECRET, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(totpCode(RFC_SECRET, Math.floor(2000000000 / 30), 8)).toBe('69279037');
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
  });

  it('round-trips base32', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('accepts the current step and one either side, and nothing replayed', () => {
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now)).toBeUndefined();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now, step)).toBeUndefined();
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBeUndefined();
  });

  it('builds the otpauth URI authenticator apps scan', () => {
    expect(otpauthUri('JBSWY3DPEHPK3PXP', 'ada@codeqlick.com', 'Codeqlick')).toBe(
      'otpauth://totp/Codeqlick%3Aada%40codeqlick.com?secret=JBSWY3DPEHPK3PXP&issuer=Codeqlick&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('SecretBox', () => {
  it('encrypts, decrypts and detects tampering or another key', () => {
    const box = new SecretBox('x'.repeat(40));
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(box.seal('same')).not.toBe(box.seal('same'));

    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => box.open(parts.join('.'))).toThrow(/authenticate/);
    expect(() => new SecretBox('y'.repeat(40)).open(sealed)).toThrow(/authenticate/);
  });
});
