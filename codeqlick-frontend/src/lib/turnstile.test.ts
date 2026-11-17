import { describe, expect, it } from 'vitest';
import { turnstileSiteKey } from './turnstile';

describe('turnstileSiteKey', () => {
  const keys = { codeqlick: 'cq-key', neoqlick: 'neo-key' };

  it("gives each brand its own account's key", () => {
    expect(turnstileSiteKey('codeqlick', keys)).toBe('cq-key');
    expect(turnstileSiteKey('neoqlick', keys)).toBe('neo-key');
  });

  it('shows no widget on Neoqlick without its key, never Codeqlick’s', () => {
    expect(turnstileSiteKey('neoqlick', { codeqlick: 'cq-key' })).toBeUndefined();
    expect(turnstileSiteKey('codeqlick', { neoqlick: 'neo-key' })).toBeUndefined();
  });
});
