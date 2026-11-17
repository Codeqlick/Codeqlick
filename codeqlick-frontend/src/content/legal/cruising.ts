import type { AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL_NEOQLICK as CONTACT_EMAIL } from '@/lib/brand';
import { de } from './cruising-texts/de';
import { en } from './cruising-texts/en';
import { es } from './cruising-texts/es';
import { fr } from './cruising-texts/fr';
import { it } from './cruising-texts/it';
import { pt } from './cruising-texts/pt';
import { adultSafetySection } from './adult-safety';
import type { LegalDocument, LegalOwner } from './index';
import { neoqlickOwnerLines } from './neoqlick';

/** Cruising's own terms of use and privacy policy (architecture 4.15). */
export type CruisingLegalPage = 'cruising-terms' | 'cruising-privacy';

/** What a text is written with: the owner's details, the contact email and the page's locale. */
export type CruisingLegalContext = { ownerLines: string; mail: string; locale: string };

/** Cruising's legal texts in one language (decision 103: in all six of Cruising's). */
export type CruisingLegalTexts = {
  updated: string;
  /** Labels of the owner's details. */
  owner: { owner: string; taxId: string; address: string; email: string; website: string };
  terms: { title: string; description: string; markdown: (c: CruisingLegalContext) => string };
  privacy: { title: string; description: string; markdown: (c: CruisingLegalContext) => string };
};

const TEXTS: Record<AppLocale, CruisingLegalTexts> = { en, es, fr, de, it, pt };

export function cruisingLegalDocument(
  page: CruisingLegalPage,
  owner: LegalOwner,
  locale: AppLocale,
): LegalDocument {
  const texts = TEXTS[locale];
  const context: CruisingLegalContext = {
    ownerLines: neoqlickOwnerLines(owner, locale),
    mail: `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`,
    locale,
  };
  const text = page === 'cruising-terms' ? texts.terms : texts.privacy;
  const safety = adultSafetySection(
    page === 'cruising-terms' ? 'terms' : 'privacy',
    locale,
    context.mail,
  );
  return {
    title: text.title,
    description: text.description,
    updated: texts.updated,
    markdown: `${text.markdown(context)}\n\n${safety}`,
  };
}
