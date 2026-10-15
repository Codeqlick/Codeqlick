/** Booking options shared by the website (in the browser) and the admin panel. No Zod here. */

export const BOOKING_TIME_ZONE = 'Europe/Madrid';
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type Interval = { start: string; end: string };

export type BookingConfig = {
  enabled: boolean;
  meetingUrl: string;
  /** Also gets the invitations, so calls land in that calendar (e.g. a Gmail address). */
  calendarEmail: string;
  durationMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  weekly: Record<Weekday, Interval[]>;
};

export type BookingSlots = { durationMinutes: number; timeZone: string; slots: string[] };

export type Booking = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  message: string | null;
  locale: 'en' | 'es';
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED' | 'CANCELLED';
  leadId: string | null;
  createdAt: string;
};

/** "09:00-13:00, 16:00-18:30" ↔ intervals (the admin form edits each day as text). */
export function intervalsToText(intervals: Interval[]): string {
  return intervals.map((interval) => `${interval.start}-${interval.end}`).join(', ');
}

/** Null when a part can't be read (the form then says which day). */
export function textToIntervals(text: string): Interval[] | null {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const intervals: Interval[] = [];
  for (const part of parts) {
    const match = /^(\d{1,2}):?(\d{2})\s*[-–]\s*(\d{1,2}):?(\d{2})$/.exec(part);
    if (!match) return null;
    const pad = (hour: string, minute: string) => `${hour.padStart(2, '0')}:${minute}`;
    const start = pad(match[1]!, match[2]!);
    const end = pad(match[3]!, match[4]!);
    if (end <= start || end > '24:00') return null;
    intervals.push({ start, end });
  }
  return intervals;
}
