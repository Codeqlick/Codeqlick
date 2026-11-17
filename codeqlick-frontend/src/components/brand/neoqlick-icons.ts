/** The Neoqlick icon set (24px grid, 2px stroke, round caps; `currentColor`): inner SVG markup. */
export const NEOQLICK_ICONS = {
  album: `<rect x="4" y="10" width="16" height="10.5" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/><circle cx="12" cy="15.2" r="1.4"/>`,
  bell: `<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>`,
  block: `<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>`,
  chat: `<path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20l1-4.3A7.5 7.5 0 1 1 20 12.5Z"/>`,
  checkin: `<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 3h5"/>`,
  heart: `<path d="M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15.4 12 20 12 20Z"/>`,
  incognito: `<path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12Z"/><circle cx="12" cy="12" r="2.5"/><path d="M4 20 20 4"/>`,
  map: `<path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4Z"/><path d="M9 4v13.5M15 6.5V20"/>`,
  match: `<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>`,
  meetup: `<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6"/>`,
  nearby: `<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>`,
  report: `<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>`,
  review: `<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8Z"/>`,
  shield: `<path d="M12 3 5 6v5.5c0 4.6 3 8 7 9.5 4-1.5 7-4.9 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>`,
  spot: `<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>`,
  swipe: `<rect x="4" y="5" width="10" height="14" rx="2.5" transform="rotate(-10 9 12)"/><rect x="10" y="4" width="10" height="14" rx="2.5" transform="rotate(10 15 11)"/>`,
  trip: `<path d="M21 4 3 11l7 2.5L12.5 21 21 4Z"/><path d="m10 13.5 5-5"/>`,
  user: `<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>`,
  verified: `<path d="M12 3l2.4 1.8 3 .1.9 2.9 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.9 2.9-3 .1L12 21l-2.4-1.8-3-.1-.9-2.9-2.4-1.8 1-2.8-1-2.8 2.4-1.8.9-2.9 3-.1Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>`,
  video: `<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/>`,
} as const;

export type NeoqlickIconName = keyof typeof NEOQLICK_ICONS;
