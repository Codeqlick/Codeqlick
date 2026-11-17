/**
 * What differs between the two brands of the platform (architecture 4.18, decision 125): name,
 * contact address, share image, icons and the browser's colour. The brand comes from the host
 * (`lib/hosts.ts`, `lib/request-brand.ts`). Constants only, safe for the server and the browser.
 */
import type { Metadata } from 'next';
import type { Brand } from './hosts';

export type BrandConfig = {
  id: Brand;
  /** The name as written in running text. */
  name: string;
  /** The lowercase wordmark. */
  wordmark: string;
  email: string;
  /** The default share image (path in `public/`), its alt text. */
  ogImage: { url: string; width: number; height: number; alt: string };
  /** Favicons and the home-screen icon. */
  icons: NonNullable<Metadata['icons']>;
  /** The browser UI colour of the manifest. */
  themeColor: string;
};

/** Neoqlick's contact address (no contact form). */
export const CONTACT_EMAIL_NEOQLICK = 'hello@neoqlick.com';

export const BRANDS: Record<Brand, BrandConfig> = {
  codeqlick: {
    id: 'codeqlick',
    name: 'Codeqlick',
    wordmark: 'codeqlick',
    email: 'hello@codeqlick.com',
    ogImage: {
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: 'Codeqlick — Redefining information technology in society',
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: '/apple-touch-icon.png',
    },
    themeColor: '#d9177e',
  },
  neoqlick: {
    id: 'neoqlick',
    name: 'Neoqlick',
    wordmark: 'neoqlick',
    email: 'hello@neoqlick.com',
    ogImage: { url: '/neoqlick/og-image.png', width: 1200, height: 630, alt: 'Neoqlick' },
    icons: {
      icon: [
        { url: '/neoqlick/favicon.ico', sizes: 'any' },
        { url: '/neoqlick/svg/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: '/neoqlick/png/apple-touch-icon.png',
    },
    themeColor: '#7c3aed',
  },
};

/** The installable apps' icons (Neoqlick's, for the three 18+ apps): the mark on night. */
export const NEOQLICK_APP_ICONS = [
  { src: '/neoqlick/png/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/neoqlick/png/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: '/neoqlick/maskable-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'maskable',
  },
  {
    src: '/neoqlick/maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
] as const;
