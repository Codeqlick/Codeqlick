import type { AccountLocale } from '../../../common/schemas/common.schemas.js';
import { de } from './de.js';
import { en } from './en.js';
import { es } from './es.js';
import { fr } from './fr.js';
import { it } from './it.js';
import { pt } from './pt.js';
import type { CruisingCopy } from './types.js';

/** Cruising's emails and push texts in each of its six languages (decision 103). */
export const CRUISING_COPY: Record<AccountLocale, CruisingCopy> = { en, es, fr, de, it, pt };

const DATE_LOCALES: Record<AccountLocale, string> = {
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
};

/** The language tag dates are written with in Cruising's texts. */
export function cruisingDateLocale(locale: AccountLocale): string {
  return DATE_LOCALES[locale];
}
