import { describe, expect, it } from 'vitest';
import { cloudSlug, formatBytes, notifiedFormNames, spamReasonKey, submissionsView } from './cloud';

describe('formatBytes', () => {
  it('picks the unit and the decimals', () => {
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(1536, 'es')).toBe('1,5 KB');
    expect(formatBytes(1024 * 1024 * 1024, 'en')).toBe('1 GB');
    expect(formatBytes(150 * 1024 * 1024, 'en')).toBe('150 MB');
  });
});

describe('cloudSlug', () => {
  it('makes an address from a name', () => {
    expect(cloudSlug('Mi Web Ñandú!', 40)).toBe('mi-web-nandu');
    expect(cloudSlug('  --Docs--  ', 40)).toBe('docs');
    expect(cloudSlug('a'.repeat(50), 40)).toHaveLength(40);
  });
});

describe('notifiedFormNames', () => {
  const forms = [
    { id: 'a', name: 'Contact' },
    { id: 'b', name: 'Quote' },
  ];

  it('is null for all forms', () => {
    expect(notifiedFormNames([], forms)).toBeNull();
    expect(notifiedFormNames([], [])).toBeNull();
  });

  it("names the listed forms in the channel's order", () => {
    expect(notifiedFormNames(['b', 'a'], forms)).toEqual(['Quote', 'Contact']);
    expect(notifiedFormNames(['a'], forms)).toEqual(['Contact']);
  });

  it('marks forms it does not know', () => {
    expect(notifiedFormNames(['a', 'z'], forms)).toEqual(['Contact', '—']);
    expect(notifiedFormNames(['a'], [])).toEqual(['—']);
  });
});

describe('spamReasonKey', () => {
  it('keeps the known reasons and reads anything else as manual', () => {
    expect(spamReasonKey('markup')).toBe('markup');
    expect(spamReasonKey('repeat')).toBe('repeat');
    expect(spamReasonKey(null)).toBe('manual');
    expect(spamReasonKey('other')).toBe('manual');
  });
});

describe('submissionsView', () => {
  it('is the inbox unless the view is spam', () => {
    expect(submissionsView('spam')).toBe('spam');
    expect(submissionsView(undefined)).toBe('inbox');
    expect(submissionsView('SPAM')).toBe('inbox');
  });
});
