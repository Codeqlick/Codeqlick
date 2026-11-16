import { describe, expect, it } from 'vitest';
import { getOutline } from '@/lib/markdown-outline';
import { MAINTENANCE_TERMS_ANCHOR } from './anchors';
import { legalDocument } from './index';

const OWNER = { name: 'Owner Name' };

describe('the maintenance plan in the legal texts (decision 110)', () => {
  it.each(['en', 'es'] as const)('the terms have the section the card links (%s)', (locale) => {
    const terms = legalDocument('terms', OWNER, locale);
    expect(getOutline(terms.markdown).map((entry) => entry.id)).toContain(
      MAINTENANCE_TERMS_ANCHOR[locale],
    );
    expect(terms.updated).toContain(locale === 'es' ? '17 de noviembre' : '17 November');
    expect(terms.markdown).toContain('19 €');
    expect(terms.markdown).toContain(locale === 'es' ? '3 cambios' : '3 small changes');
  });

  it.each(['en', 'es'] as const)('the privacy policy names Stripe for the plan (%s)', (locale) => {
    const policy = legalDocument('privacy', OWNER, locale).markdown;
    expect(policy).toContain('Stripe Payments Europe');
    expect(policy).toContain(
      locale === 'es' ? 'contratas su plan de mantenimiento' : 'take its maintenance plan',
    );
  });
});
