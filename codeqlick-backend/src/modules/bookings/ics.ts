/** A minimal iCalendar invitation (RFC 5545) for a booked call, and its cancellation. */

/** `20261023T080000Z` */
function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Text values escape backslashes, semicolons, commas and newlines. */
function text(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export function callInvitation(call: {
  uid: string;
  sequence: number;
  method: 'REQUEST' | 'CANCEL';
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description: string;
  url: string;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  now?: Date;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Codeqlick//Bookings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${call.method}`,
    'BEGIN:VEVENT',
    `UID:${call.uid}`,
    `SEQUENCE:${call.sequence}`,
    `DTSTAMP:${stamp(call.now ?? new Date())}`,
    `DTSTART:${stamp(call.startsAt)}`,
    `DTEND:${stamp(call.endsAt)}`,
    `SUMMARY:${text(call.summary)}`,
    `DESCRIPTION:${text(call.description)}`,
    `LOCATION:${text(call.url)}`,
    `URL:${call.url}`,
    `ORGANIZER;CN=${text(call.organizer.name)}:mailto:${call.organizer.email}`,
    `ATTENDEE;CN=${text(call.attendee.name)};ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${call.attendee.email}`,
    `STATUS:${call.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
