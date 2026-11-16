import { describe, expect, it } from 'vitest';
import { getOutline } from '@/lib/markdown-outline';
import { STATUS_SUBSCRIBERS_ANCHOR } from './anchors';
import { cloudTermsDocument } from './cloud';
import { legalDocument } from './index';

const OWNER = { name: 'Owner Name' };

describe('status page subscribers in the legal texts (decision 105)', () => {
  it.each(['en', 'es'] as const)(
    'the privacy policy has the section the form links (%s)',
    (locale) => {
      const policy = legalDocument('privacy', OWNER, locale).markdown;
      const anchors = getOutline(policy).map((entry) => entry.id);
      expect(anchors).toContain(STATUS_SUBSCRIBERS_ANCHOR[locale]);
      // Who is the controller, the basis, the retention and unsubscribing.
      expect(policy).toContain(locale === 'es' ? 'encargado del tratamiento' : 'as processor');
      expect(policy).toContain('6.1.a');
      expect(policy).toContain(locale === 'es' ? '12 meses' : '12 months');
      expect(policy).toContain(
        locale === 'es' ? 'No guardamos tu dirección IP' : "We don't keep your IP",
      );
    },
  );

  it.each(['en', 'es'] as const)('the Cloud terms make Codeqlick the processor (%s)', (locale) => {
    const terms = cloudTermsDocument(OWNER, locale, 'codeqlick.app');
    expect(terms.updated).toContain(locale === 'es' ? '17 de noviembre' : '17 November');
    expect(terms.markdown).toContain(locale === 'es' ? 'encargado del tratamiento' : 'processor');
    expect(terms.markdown).toContain('OVHcloud');
    expect(terms.markdown).toContain(`/${locale}/privacy`);
    expect(terms.markdown).not.toContain('${');
  });
});
