'use client';

import { useSyncExternalStore } from 'react';
import { intlLocale } from '@/lib/locales';

type LocalTimeProps = { iso: string; locale: string };

function format(iso: string, locale: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    timeZoneName: timeZone ? 'short' : undefined,
  }).format(date);
}

const subscribe = () => () => undefined;

/**
 * A moment in the reader's own time zone. The server doesn't know it, so the server's render (and
 * hydration) says the time in UTC and the browser then shows it in its own zone.
 */
export function LocalTime({ iso, locale }: LocalTimeProps) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return <time dateTime={iso}>{format(iso, locale, inBrowser ? undefined : 'UTC')}</time>;
}
