import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { isGridBbox } from './cruising';
import { suggestionsBbox, weekLabels, weeksTotal, type CruisingStatsWeek } from './cruising-stats';

const week = (start: string, members: number): CruisingStatsWeek => ({
  start,
  members,
  active: 0,
  spots: { pending: 0, live: 0, rejected: 0 },
  checkIns: 0,
  meetups: 0,
  messages: 0,
  roomMessages: 0,
  media: 0,
  reportsOpened: 0,
  reportsDecided: 0,
  medianDecisionHours: null,
  takedowns: 0,
});

describe('Cruising statistics (decision 101)', () => {
  it('labels each week by its Monday, short on the axis and in full for the tables', () => {
    const { labels, longLabels } = weekLabels(['2026-11-09', '2026-11-16'], 'en-GB');
    expect(labels).toEqual(['09/11', '16/11']);
    expect(longLabels).toEqual(['9 Nov 2026', '16 Nov 2026']);
    // The Monday stays the Monday wherever the server runs.
    expect(weekLabels(['2026-01-05'], 'es').longLabels[0]).toContain('5');
  });

  it('adds a figure up over the weeks', () => {
    expect(weeksTotal([week('2026-11-09', 2), week('2026-11-16', 3)], (w) => w.members)).toBe(5);
    expect(weeksTotal([], (w) => w.members)).toBe(0);
  });

  it('has its texts in English and Spanish', () => {
    expect(Object.keys(es.AdminCruisingStats).toSorted()).toEqual(
      Object.keys(en.AdminCruisingStats).toSorted(),
    );
    expect(Object.keys(es.Cruising.tour).toSorted()).toEqual(
      Object.keys(en.Cruising.tour).toSorted(),
    );
  });
});

describe('onboarding suggestions (decision 102)', () => {
  it('look around the map view on the 0.25° grid', () => {
    const box = suggestionsBbox({ center: [40.4168, -3.7038], located: true });
    expect(box).toEqual({ minLng: -4.25, minLat: 39.75, maxLng: -3.0, maxLat: 41 });
    expect(box && isGridBbox(box)).toBe(true);
  });

  it('stay inside the world at its edges', () => {
    const box = suggestionsBbox({ center: [89.9, 179.9], located: true });
    expect(box).toMatchObject({ maxLat: 90, maxLng: 180 });
  });

  it('use my country when the map shows the whole world', () => {
    expect(suggestionsBbox({ center: [30, 10], located: false })).toBeNull();
  });
});
