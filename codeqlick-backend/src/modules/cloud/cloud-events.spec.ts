import { describe, expect, it } from 'vitest';
import { madridDay } from './cloud-analytics.js';
import {
  actionFilter,
  addDays,
  eventCsvLine,
  eventsCsv,
  eventsFilter,
  exportRange,
  isCalendarDay,
  rangeError,
  type EventCsvRow,
  type EventCursor,
} from './cloud-events.js';
import { eventsExportQuerySchema, eventsQuerySchema } from './cloud.schemas.js';

const row = (n: number, over: Partial<EventCsvRow> = {}): EventCsvRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  createdAt: new Date(Date.UTC(2026, 10, 14, 12, 0, 0) - n * 1000),
  actorName: 'Ada',
  tokenName: null,
  action: 'domain.added',
  targetLabel: 'shop.example',
  details: null,
  ip: '203.0.113.9',
  ...over,
});

describe('event period', () => {
  it('accepts only real YYYY-MM-DD days', () => {
    expect(isCalendarDay('2026-02-28')).toBe(true);
    expect(isCalendarDay('2024-02-29')).toBe(true);
    expect(isCalendarDay('2026-02-29')).toBe(false);
    expect(isCalendarDay('2026-13-01')).toBe(false);
    expect(isCalendarDay('2026-1-01')).toBe(false);
    expect(isCalendarDay('yesterday')).toBe(false);
  });

  it('turns Madrid days into UTC bounds, both days included', () => {
    // Summer (UTC+2) and winter (UTC+1).
    expect(eventsFilter({ from: '2026-07-01', to: '2026-07-01' })).toMatchObject({
      since: new Date('2026-06-30T22:00:00.000Z'),
      until: new Date('2026-07-01T22:00:00.000Z'),
    });
    expect(eventsFilter({ from: '2026-01-15', to: '2026-01-31' })).toMatchObject({
      since: new Date('2026-01-14T23:00:00.000Z'),
      until: new Date('2026-01-31T23:00:00.000Z'),
    });
    // The day clocks go forward is 23 hours long.
    expect(eventsFilter({ from: '2026-03-29', to: '2026-03-29' })).toMatchObject({
      since: new Date('2026-03-28T23:00:00.000Z'),
      until: new Date('2026-03-29T22:00:00.000Z'),
    });
    // The day they go back is 25 hours long.
    expect(eventsFilter({ from: '2026-10-25', to: '2026-10-25' })).toMatchObject({
      since: new Date('2026-10-24T22:00:00.000Z'),
      until: new Date('2026-10-25T23:00:00.000Z'),
    });
  });

  it('leaves out what is not given', () => {
    expect(eventsFilter({})).toEqual({ since: undefined, until: undefined, action: undefined });
    expect(eventsFilter({ to: '2026-07-01' }).since).toBeUndefined();
  });

  it('defaults the export to the last 30 days up to today, in Madrid', () => {
    // 23:30 UTC on 14 November is already the 15th in Madrid.
    const now = new Date('2026-11-14T23:30:00.000Z');
    expect(exportRange({}, now)).toEqual({ from: '2026-10-17', to: '2026-11-15' });
    expect(exportRange({ to: '2026-03-10' }, now)).toEqual({
      from: '2026-02-09',
      to: '2026-03-10',
    });
    expect(exportRange({ from: '2026-11-01' }, now)).toEqual({
      from: '2026-11-01',
      to: '2026-11-15',
    });
  });

  it('allows at most 365 days between from and to, in order', () => {
    expect(rangeError('2026-01-01', '2026-01-01')).toBeNull();
    expect(rangeError('2026-01-01', '2027-01-01')).toBeNull();
    expect(rangeError('2024-01-01', '2024-12-31')).toBeNull();
    expect(rangeError('2026-01-01', '2027-01-02')).toMatch(/365 days/);
    expect(rangeError('2026-02-02', '2026-02-01')).toMatch(/after/);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('event action filter', () => {
  it('matches exactly, or by a prefix that ends in a dot', () => {
    expect(actionFilter('domain.added')).toEqual({ equals: 'domain.added' });
    expect(actionFilter('domain.')).toEqual({ startsWith: 'domain.' });
    expect(eventsFilter({ action: 'member.' }).action).toEqual({ startsWith: 'member.' });
  });
});

describe('events query schemas', () => {
  it('takes the list filters as optional, with no default period', () => {
    const parsed = eventsQuerySchema.parse({});
    expect(parsed).toMatchObject({ page: 1, pageSize: 20 });
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
    expect(eventsQuerySchema.parse({ from: '2026-11-01', action: 'domain.' })).toMatchObject({
      from: '2026-11-01',
      action: 'domain.',
    });
  });

  it('refuses bad dates, bad actions and too long or reversed periods', () => {
    expect(eventsQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(eventsQuerySchema.safeParse({ from: '01/02/2026' }).success).toBe(false);
    expect(eventsQuerySchema.safeParse({ action: 'Domain Added' }).success).toBe(false);
    expect(eventsQuerySchema.safeParse({ action: 'domain..' }).success).toBe(false);
    expect(eventsQuerySchema.safeParse({ from: '2025-01-01', to: '2026-06-01' }).success).toBe(
      false,
    );
    expect(
      eventsExportQuerySchema.safeParse({ from: '2026-05-02', to: '2026-05-01' }).success,
    ).toBe(false);
    expect(
      eventsExportQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-02' }).success,
    ).toBe(false);
    // Only `from`, more than a year ago: `to` defaults to today, too far apart.
    expect(eventsExportQuerySchema.safeParse({ from: '2020-01-01' }).success).toBe(false);
  });

  it('fills the export period by default', () => {
    const parsed = eventsExportQuerySchema.parse({});
    expect(parsed.to).toBe(madridDay(new Date()));
    expect(parsed.from).toBe(addDays(parsed.to, -29));
    expect(parsed.action).toBeUndefined();
    expect(
      eventsExportQuerySchema.parse({ from: '2026-01-01', to: '2026-01-31', action: 'project.' }),
    ).toEqual({ from: '2026-01-01', to: '2026-01-31', action: 'project.' });
  });
});

describe('events CSV', () => {
  it('writes a row: UTC date, details as JSON, formulas defused', () => {
    expect(
      eventCsvLine(
        row(0, {
          actorName: '=HYPERLINK("http://evil")',
          tokenName: 'CI',
          targetLabel: '-shop, main',
          details: { name: 'shop.example', count: 2 },
        }),
      ),
    ).toBe(
      '2026-11-14T12:00:00.000Z,"\'=HYPERLINK(""http://evil"")",CI,domain.added,"\'-shop, main","{""name"":""shop.example"",""count"":2}",203.0.113.9\r\n',
    );
    expect(eventCsvLine(row(0, { ip: null }))).toBe(
      '2026-11-14T12:00:00.000Z,Ada,,domain.added,shop.example,,\r\n',
    );
  });

  it('streams the BOM and header, then page after page from the last row', async () => {
    const all = [1, 2, 3, 4, 5].map((n) => row(n));
    const calls: Array<EventCursor | null> = [];
    const page = (after: EventCursor | null, take: number) => {
      calls.push(after);
      const start = after ? all.findIndex((r) => r.id === after.id) + 1 : 0;
      return Promise.resolve(all.slice(start, start + take));
    };
    const chunks: string[] = [];
    for await (const chunk of eventsCsv(page, 2)) chunks.push(chunk);

    expect(chunks[0]).toBe('\uFEFFdate,actor,token,action,target,details,ip\r\n');
    expect(chunks).toHaveLength(4);
    expect(chunks.join('').split('\r\n')).toHaveLength(7);
    expect(calls).toEqual([
      null,
      { createdAt: all[1]!.createdAt, id: all[1]!.id },
      { createdAt: all[3]!.createdAt, id: all[3]!.id },
    ]);
  });

  it('asks once more when the last page is full, and writes only the header when empty', async () => {
    const empty: string[] = [];
    for await (const chunk of eventsCsv(() => Promise.resolve([]), 2)) empty.push(chunk);
    expect(empty).toEqual(['\uFEFFdate,actor,token,action,target,details,ip\r\n']);

    const all = [row(1), row(2)];
    let calls = 0;
    const page = (after: EventCursor | null) => {
      calls += 1;
      return Promise.resolve(after ? [] : all);
    };
    for await (const chunk of eventsCsv(page, 2)) expect(typeof chunk).toBe('string');
    expect(calls).toBe(2);
  });
});
