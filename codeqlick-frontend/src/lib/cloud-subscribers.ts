import type { CloudStatusSubscriberStatus } from '@/lib/api/cloud';

/**
 * The console's list of status page subscribers (architecture 4.13, decision 105): its filters
 * and links. Its own query params (`subscribers`, `subscribersPage`) so it never moves the
 * notices' `page`. Pure.
 */
export const SUBSCRIBER_FILTERS: ReadonlyArray<CloudStatusSubscriberStatus | undefined> = [
  undefined,
  'ACTIVE',
  'PENDING',
  'UNSUBSCRIBED',
];

/** The status filter from the URL, or undefined (every status) for anything else. */
export function subscriberFilter(
  raw: string | string[] | undefined,
): CloudStatusSubscriberStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SUBSCRIBER_FILTERS.find((filter) => filter !== undefined && filter === value);
}

/** The page number from the URL: a whole number from 1, else 1. */
export function subscriberPage(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 1 ? value : 1;
}

/** A link to the list with a filter and page, keeping the address short when they are defaults. */
export function subscribersHref(
  pathname: string,
  status: CloudStatusSubscriberStatus | undefined,
  page: number,
): string {
  const params = new URLSearchParams();
  if (status) params.set('subscribers', status);
  if (page > 1) params.set('subscribersPage', String(page));
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}#subscribers-title`;
}
