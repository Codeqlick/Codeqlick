import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatMinutes,
  fromDateTimeInput,
  isScheduled,
  parsePage,
  toDateInput,
  toDateTimeInput,
} from './format';

describe('format helpers', () => {
  it('reads date-times typed in Madrid time, in winter and in summer', () => {
    // CET is UTC+1, CEST is UTC+2.
    expect(fromDateTimeInput('2026-01-15T10:30')).toBe('2026-01-15T09:30:00.000Z');
    expect(fromDateTimeInput('2026-07-15T10:30')).toBe('2026-07-15T08:30:00.000Z');
    expect(fromDateTimeInput('2026-07-15')).toBeNull();
    expect(fromDateTimeInput('')).toBeNull();
  });

  it('writes instants back as Madrid wall-clock time', () => {
    expect(toDateTimeInput('2026-01-15T09:30:00.000Z')).toBe('2026-01-15T10:30');
    expect(toDateTimeInput('2026-07-15T08:30:00.000Z')).toBe('2026-07-15T10:30');
    expect(toDateTimeInput(null)).toBe('');
    expect(toDateTimeInput('garbage')).toBe('');
    // Round trip across the October DST change.
    expect(toDateTimeInput(fromDateTimeInput('2026-10-25T12:00'))).toBe('2026-10-25T12:00');
  });

  it('formats sizes and form values', () => {
    expect(formatBytes(870, 'en')).toBe('870 B');
    expect(formatBytes(12 * 1024, 'en')).toBe('12 KB');
    expect(formatBytes(1.4 * 1024 * 1024, 'es')).toBe('1,4 MB');
    expect(toDateInput('2026-11-01T00:00:00.000Z')).toBe('2026-11-01');
    expect(toDateInput(null)).toBe('');
  });

  it('parses ?page= defensively', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage(['2', '5'])).toBe(2);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });

  it('tells scheduled content apart', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    expect(isScheduled({ status: 'PUBLISHED', publishedAt: '2026-10-16T00:00:00Z' }, now)).toBe(
      true,
    );
    expect(isScheduled({ status: 'PUBLISHED', publishedAt: '2026-10-14T00:00:00Z' }, now)).toBe(
      false,
    );
    expect(isScheduled({ status: 'DRAFT', publishedAt: '2026-10-16T00:00:00Z' }, now)).toBe(false);
    expect(isScheduled({ status: 'PUBLISHED', publishedAt: null }, now)).toBe(false);
  });
});

describe('formatMinutes', () => {
  it('shows hours and minutes', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(180)).toBe('3 h');
    expect(formatMinutes(95)).toBe('1 h 35 min');
  });
});
