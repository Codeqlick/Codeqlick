import type { AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL_NEOQLICK } from '@/lib/brand';
import type { LegalDocument, LegalOwner } from './index';
import { NEOQLICK_TEXTS } from './neoqlick-texts';

/** The pages of Neoqlick's portal that hold a legal text (architecture 4.18, decision 129). */
export type NeoqlickLegalPage = 'legal' | 'privacy' | 'terms';

const TRADE_NAME_OF: Record<AppLocale, string> = {
  en: 'trade name of',
  es: 'nombre comercial de',
  fr: 'nom commercial de',
  de: 'Handelsname von',
  it: 'nome commerciale di',
  pt: 'nome comercial de',
};

/**
 * The operator's details as a Markdown list: "Neoqlick, trade name of <name>", the tax ID and the
 * address when they are set, the contact address and the website.
 */
export function neoqlickOwnerLines(
  owner: LegalOwner,
  locale: AppLocale,
  tradeName = 'Neoqlick',
  website = 'neoqlick.com',
): string {
  const labels = NEOQLICK_TEXTS[locale].owner;
  const lines = [`- **${labels.owner}:** ${tradeName}, ${TRADE_NAME_OF[locale]} ${owner.name}`];
  if (owner.taxId) lines.push(`- **${labels.taxId}:** ${owner.taxId}`);
  if (owner.address) lines.push(`- **${labels.address}:** ${owner.address}`);
  lines.push(
    `- **${labels.email}:** [${CONTACT_EMAIL_NEOQLICK}](mailto:${CONTACT_EMAIL_NEOQLICK})`,
  );
  lines.push(`- **${labels.website}:** ${website}`);
  return lines.join('\n');
}

/** A legal text of the portal, written for the operator, in one of the six languages. */
export function neoqlickLegalDocument(
  page: NeoqlickLegalPage,
  owner: LegalOwner,
  locale: AppLocale,
  tradeName = 'Neoqlick',
): LegalDocument {
  const texts = NEOQLICK_TEXTS[locale];
  const doc = texts[page];
  const mail = `[${CONTACT_EMAIL_NEOQLICK}](mailto:${CONTACT_EMAIL_NEOQLICK})`;
  const ownerLines = neoqlickOwnerLines(owner, locale, tradeName);
  const markdown = doc.sections
    .map(([heading, body]) => `## ${heading}\n\n${body}`)
    .join('\n\n')
    .replaceAll('{owner}', ownerLines)
    .replaceAll('{mail}', mail);
  return { title: doc.title, description: doc.description, updated: texts.updated, markdown };
}
