import messages from './src/messages/en.json';
import { routing } from './src/i18n/routing';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}

declare global {
  interface Window {
    /** Umami's tracker, when analytics is set up (see components/layout/Analytics). */
    umami?: { track: (event: string, data?: Record<string, string | number>) => void };
  }
}
