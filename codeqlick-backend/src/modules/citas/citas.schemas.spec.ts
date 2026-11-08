import { describe, expect, it } from 'vitest';
import { pageSlugSchema, weeklySchema } from './citas.schemas.js';

const empty = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

describe('pageSlugSchema', () => {
  it('takes lowercase words with single dashes', () => {
    expect(pageSlugSchema.parse(' Pelu-Ana ')).toBe('pelu-ana');
    expect(pageSlugSchema.safeParse('ab').success).toBe(false);
    expect(pageSlugSchema.safeParse('pelu--ana').success).toBe(false);
    expect(pageSlugSchema.safeParse('peluquería').success).toBe(false);
  });

  it("refuses the app's own route words", () => {
    expect(pageSlugSchema.safeParse('cancelar').success).toBe(false);
    expect(pageSlugSchema.safeParse('editar').success).toBe(false);
  });
});

describe('weeklySchema', () => {
  it('takes hours that follow each other and refuses overlapping ones', () => {
    const ok = {
      ...empty,
      mon: [
        { start: '13:00', end: '14:00' },
        { start: '09:00', end: '13:00' },
      ],
    };
    expect(weeklySchema.safeParse(ok).success).toBe(true);
    const overlapping = {
      ...empty,
      mon: [
        { start: '09:00', end: '13:00' },
        { start: '12:00', end: '14:00' },
      ],
    };
    expect(weeklySchema.safeParse(overlapping).success).toBe(false);
    expect(
      weeklySchema.safeParse({ ...empty, tue: [{ start: '10:00', end: '09:00' }] }).success,
    ).toBe(false);
  });
});
