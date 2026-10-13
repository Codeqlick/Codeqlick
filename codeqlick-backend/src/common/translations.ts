import { Locale } from '../generated/prisma/client.js';
import { toApiLocale, toDbLocale, type ApiLocale } from './schemas/common.schemas.js';

/**
 * Picks the translation for `locale`, falling back to English, then to whatever exists.
 * Returns undefined only when there are no translations at all.
 */
export function pickTranslation<T extends { locale: Locale }>(
  translations: readonly T[],
  locale: ApiLocale,
): T | undefined {
  const wanted = toDbLocale(locale);
  return (
    translations.find((t) => t.locale === wanted) ??
    translations.find((t) => t.locale === Locale.EN) ??
    translations[0]
  );
}

/** Available locales, in a stable order ('en' first). */
export function availableLocales(translations: readonly { locale: Locale }[]): ApiLocale[] {
  const set = new Set(translations.map((t) => toApiLocale(t.locale)));
  return (['en', 'es'] as const).filter((locale) => set.has(locale));
}
