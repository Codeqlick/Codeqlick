import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import adult from '@/components/adult/adult.module.css';
import { Markdown } from '@/components/markdown/Markdown';
import { type LegalOwner } from '@/content/legal';
import { cruisingLegalDocument, type CruisingLegalPage } from '@/content/legal/cruising';
import { resolveCruisingLocale } from '@/i18n/locale';
import { neoqlickLegalOwner } from '@/lib/env';
import { webappAlternates } from '@/lib/webapp-seo';

type PageProps = { params: Promise<{ locale: string }> };

/** Until a legal holder is set (NEOQLICK_LEGAL_OWNER_NAME or LEGAL_OWNER_NAME) the texts name Neoqlick. */
function owner(): LegalOwner {
  return neoqlickLegalOwner ?? { name: 'Neoqlick' };
}

const PATHS: Record<CruisingLegalPage, string> = {
  'cruising-terms': '/terms-of-use',
  'cruising-privacy': '/privacy-policy',
};

export function legalMetadata(page: CruisingLegalPage) {
  return async ({ params }: PageProps): Promise<Metadata> => {
    const locale = resolveCruisingLocale((await params).locale);
    const { title, description } = cruisingLegalDocument(page, owner(), locale);
    return {
      title: { absolute: title },
      description,
      alternates: webappAlternates('cruising', locale, PATHS[page]),
    };
  };
}

/** Cruising's terms of use or privacy policy (architecture 4.15), inside Cruising's own frame. */
export function legalPage(page: CruisingLegalPage) {
  return async function CruisingLegal({ params }: PageProps) {
    const locale = resolveCruisingLocale((await params).locale);
    setRequestLocale(locale);
    const t = await getTranslations({ locale, namespace: 'Legal' });
    const tm = await getTranslations({ locale, namespace: 'Markdown' });
    const document = cruisingLegalDocument(page, owner(), locale);
    return (
      <article className={adult.rules}>
        <h1 className={adult.pageTitle}>{document.title}</h1>
        <p className={adult.muted}>{t('updated', { date: document.updated })}</p>
        <Markdown anchors={{ linkLabel: tm('anchorLink') }}>{document.markdown}</Markdown>
      </article>
    );
  };
}
