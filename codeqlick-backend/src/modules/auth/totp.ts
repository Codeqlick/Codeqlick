import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 6238 time-based one-time passwords (HMAC-SHA1, 30 s steps, 6 digits), as authenticator apps use. */

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32-encoded (the form authenticator apps accept). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/** The code for one time step. */
export function totpCode(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Checks a code against the current step and one step either side (clock drift). Returns the
 * matching step, or undefined. Steps at or before `lastUsedStep` are refused, so a code that was
 * already accepted can't be replayed.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null = null,
): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  const current = timeStep(nowMs);
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return undefined;
}

/** `otpauth://` URI that authenticator apps read from a QR code. */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
