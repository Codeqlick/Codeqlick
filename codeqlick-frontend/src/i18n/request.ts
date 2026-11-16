import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { withFallback, type Messages } from './messages';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const own = (await import(`../messages/${locale}.json`)).default as Messages;
  // French, German, Italian and Portuguese cover what Cruising's host shows (decision 103); any
  // other text falls back to English.
  const messages =
    locale === 'en' || locale === 'es'
      ? own
      : withFallback(own, (await import('../messages/en.json')).default as unknown as Messages);

  return { locale, messages };
});
