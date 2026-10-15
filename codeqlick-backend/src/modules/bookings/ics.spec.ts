import { describe, expect, it } from 'vitest';
import { callInvitation } from './ics.js';

describe('callInvitation', () => {
  const base = {
    uid: 'b1@codeqlick.com',
    sequence: 0,
    method: 'REQUEST' as const,
    startsAt: new Date('2026-10-23T08:00:00.000Z'),
    endsAt: new Date('2026-10-23T08:30:00.000Z'),
    summary: 'Llamada con Codeqlick',
    description: 'Hola, Ana; nos vemos.\nEnlace: https://meet.google.com/abc-defg-hij',
    url: 'https://meet.google.com/abc-defg-hij',
    organizer: { name: 'Codeqlick', email: 'hello@codeqlick.com' },
    attendee: { name: 'Ana Pérez', email: 'ana@example.com' },
    now: new Date('2026-10-15T10:00:00.000Z'),
  };

  it('writes the event in UTC, escaped, with CRLF lines of at most 75 octets', () => {
    const ics = callInvitation(base);
    expect(ics).toContain('METHOD:REQUEST\r\n');
    expect(ics).toContain('DTSTART:20261023T080000Z\r\n');
    expect(ics).toContain('DTEND:20261023T083000Z\r\n');
    expect(ics).toContain('DESCRIPTION:Hola\\, Ana\\; nos vemos.\\nEnlace:');
    expect(ics).toContain('STATUS:CONFIRMED');
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it('cancels the same event with a higher sequence', () => {
    const ics = callInvitation({ ...base, method: 'CANCEL', sequence: 1 });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('STATUS:CANCELLED');
  });
});
