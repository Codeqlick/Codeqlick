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

/** The base namespaces on Neoqlick's hosts (architecture 4.18): the base minus the website's own (booking, calculator, contact, newsletter, website check). */
export const NEOQLICK_CLIENT_NAMESPACES = BASE_CLIENT_NAMESPACES.filter(
  (name) => !['Book', 'Calculator', 'Contact', 'Newsletter', 'WebsiteCheck'].includes(name),
);

/** What each section's own Client Components add, given by its layout. */
export const APP_NAMESPACES = {
  admin: ['SiteNews', 'CruisingSpotImport'],
  citas: ['Citas'],
  cloud: ['Cloud'],
  cruising: ['Cruising'],
  meetings: ['Meetings'],
  portal: ['SiteEditor', 'SiteNews'],
  swipe: ['Swipe', 'Videochat'],
  videochat: ['Videochat'],
} as const;
