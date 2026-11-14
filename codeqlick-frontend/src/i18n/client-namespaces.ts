/**
 * Namespaces Client Components read (`useTranslations` in a 'use client' file) on any page. Every
 * page's HTML carries the messages handed to the client, so they are only these and each app's own
 * (APP_NAMESPACES), never the whole catalogue (~225 KB, mostly server-rendered text).
 */
export const BASE_CLIENT_NAMESPACES = [
  'Account',
  'Book',
  'Calculator',
  'Common',
  'Contact',
  'Error',
  'LocaleSwitcher',
  'Newsletter',
  'WebsiteCheck',
] as const;

/** What each section's own Client Components add, given by its layout. */
export const APP_NAMESPACES = {
  citas: ['Citas'],
  cloud: ['Cloud'],
  meetings: ['Meetings'],
  portal: ['SiteEditor'],
  swipe: ['Swipe', 'Videochat'],
  videochat: ['Videochat'],
} as const;
