/**
 * Public site constants. Safe for both server and client bundles (no secrets).
 */
export const SITE_NAME = 'Codeqlick';
export const CONTACT_EMAIL = 'hello@codeqlick.com';
export const TAGLINE = 'Redefining information technology in society';

export const SOCIAL_LINKS = [
  { name: 'Facebook', href: 'https://facebook.com/Codeqlick' },
  { name: 'Instagram', href: 'https://instagram.com/Codeqlick' },
  { name: 'X', href: 'https://x.com/Codeqlick' },
] as const;

export const STACK = [
  'TypeScript',
  'React',
  'Next.js',
  'Node.js',
  'NestJS',
  'PostgreSQL',
  'Docker',
  'Stripe',
] as const;
