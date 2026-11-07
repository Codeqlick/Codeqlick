import { describe, expect, it } from 'vitest';
import { hasChanges } from './portal-sites.service.js';

const content = { business: { name: 'Lucía' }, hours: [{ days: 'Lunes', hours: 'Cerrado' }] };

describe('hasChanges', () => {
  it('is false without a draft, or with a draft equal to the published site', () => {
    expect(
      hasChanges({ content, draftContent: null, draftPreset: null, preset: 'peluqueria' }),
    ).toBe(false);
    expect(
      hasChanges({
        content,
        draftContent: structuredClone(content),
        draftPreset: null,
        preset: 'peluqueria',
      }),
    ).toBe(false);
  });

  it('is true when a text or the style changed', () => {
    expect(
      hasChanges({
        content,
        draftContent: { ...content, business: { name: 'Lucía Peluquería' } },
        draftPreset: null,
        preset: 'peluqueria',
      }),
    ).toBe(true);
    expect(
      hasChanges({ content, draftContent: content, draftPreset: 'florista', preset: 'peluqueria' }),
    ).toBe(true);
  });
});
