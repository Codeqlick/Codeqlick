import { describe, expect, it } from 'vitest';
import { intervalsToText, textToIntervals } from './booking';

describe('textToIntervals', () => {
  it('reads the hours of a day', () => {
    expect(textToIntervals('9:00-13:00, 16:00 – 18:30')).toEqual([
      { start: '09:00', end: '13:00' },
      { start: '16:00', end: '18:30' },
    ]);
    expect(textToIntervals('')).toEqual([]);
    expect(textToIntervals('0930-1100')).toEqual([{ start: '09:30', end: '11:00' }]);
  });

  it('refuses what it cannot read or ends before it starts', () => {
    expect(textToIntervals('mañana')).toBeNull();
    expect(textToIntervals('13:00-09:00')).toBeNull();
  });

  it('writes them back', () => {
    expect(intervalsToText([{ start: '09:00', end: '13:00' }])).toBe('09:00-13:00');
  });
});
