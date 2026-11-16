import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import vc from '@/app/[locale]/videochat/videochat.module.css';
import { Markdown } from '@/components/markdown/Markdown';
import { type LegalOwner } from '@/content/legal';
import { cruisingLegalDocument, type CruisingLegalPage } from '@/content/legal/cruising';
import { resolveCruisingLocale } from '@/i18n/locale';
import { legalOwner } from '@/lib/env';
import { SITE_NAME } from '@/lib/site';
import { webappAlternates } from '@/lib/webapp-seo';

type PageProps = { params: Promise<{ locale: string }> };

/** Until LEGAL_OWNER_NAME is set the texts name the studio. */
function owner(): LegalOwner {
  return legalOwner ?? { name: SITE_NAME };
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
      <article className={vc.rules}>
        <h1 className={vc.pageTitle}>{document.title}</h1>
        <p className={vc.muted}>{t('updated', { date: document.updated })}</p>
        <Markdown anchors={{ linkLabel: tm('anchorLink') }}>{document.markdown}</Markdown>
      </article>
    );
  };
}
