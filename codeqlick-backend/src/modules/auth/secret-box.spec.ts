import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box.js';

describe('SecretBox', () => {
  const box = new SecretBox('s'.repeat(40));

  it('round-trips a secret', () => {
    expect(box.open(box.seal('JBSWY3DPEHPK3PXP'))).toBe('JBSWY3DPEHPK3PXP');
    expect(box.open(box.seal(''))).toBe('');
  });

  it('rejects a truncated authentication tag', () => {
    const parts = box.seal('JBSWY3DPEHPK3PXP').split('.');
    parts[2] = Buffer.from(parts[2]!, 'base64url').subarray(0, 12).toString('base64url');
    expect(() => box.open(parts.join('.'))).toThrow();
    parts[2] = '';
    expect(() => box.open(parts.join('.'))).toThrow();
  });
});
