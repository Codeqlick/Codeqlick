import { describe, expect, it } from 'vitest';
import { siteContentSchema } from './managed-sites.schemas.js';

const notices = siteContentSchema.shape.notices;

describe('the site notices', () => {
  it('takes a closure with its dates and one with only its last day', () => {
    const result = notices.safeParse([
      {
        text: 'Cerrado por vacaciones del 10 al 20 de agosto',
        from: '2026-08-10',
        until: '2026-08-20',
      },
      { text: 'El 12 de octubre abrimos de 10:00 a 14:00', until: '2026-10-12' },
    ]);
    expect(result.success).toBe(true);
  });

  it('refuses a last day before the first', () => {
    const result = notices.safeParse([
      { text: 'Cerrado', from: '2026-08-20', until: '2026-08-10' },
    ]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([0, 'until']);
  });

  it.each(['2026-8-1', '2026-02-30', 'mañana', ''])('refuses the day %j', (until) => {
    expect(notices.safeParse([{ text: 'Cerrado', until }]).success).toBe(false);
  });

  it('keeps them to five', () => {
    const notice = { text: 'Cerrado', until: '2026-08-10' };
    expect(notices.safeParse(Array.from({ length: 6 }, () => notice)).success).toBe(false);
  });
});
