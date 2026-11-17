import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Markdown } from '@/components/markdown/Markdown';
import { neoqlickLegalDocument, type NeoqlickLegalPage } from '@/content/legal/neoqlick';
import { resolveCruisingLocale } from '@/i18n/locale';
import { NEOQLICK_TRADE_NAME, neoqlickLegalOwner } from '@/lib/env';
import { pageMetadata } from '@/lib/seo';
import styles from './neoqlick.module.css';

type PageProps = { params: Promise<{ locale: string }> };

/** The page's `generateMetadata`: indexed, in the six languages, 404 until a legal holder is set. */
export function neoqlickLegalMetadata(page: NeoqlickLegalPage) {
  return async ({ params }: PageProps): Promise<Metadata> => {
    const locale = resolveCruisingLocale((await params).locale);
    if (!neoqlickLegalOwner) notFound();
    const document = neoqlickLegalDocument(page, neoqlickLegalOwner, locale, NEOQLICK_TRADE_NAME);
    return {
      ...(await pageMetadata({
        locale,
        path: `/${page}`,
        title: document.title,
        description: document.description,
      })),
      title: document.title,
    };
  };
}

/** The legal notice, the privacy policy or the terms of the portal (like the website's, hidden without a holder). */
export function neoqlickLegalPage(page: NeoqlickLegalPage) {
  return async function NeoqlickLegal({ params }: PageProps) {
    const locale = resolveCruisingLocale((await params).locale);
    setRequestLocale(locale);
    if (!neoqlickLegalOwner) notFound();
    const t = await getTranslations({ locale, namespace: 'Legal' });
    const tm = await getTranslations({ locale, namespace: 'Markdown' });
    const document = neoqlickLegalDocument(page, neoqlickLegalOwner, locale, NEOQLICK_TRADE_NAME);
    return (
      <article className={styles.doc}>
        <h1 className={styles.docTitle}>{document.title}</h1>
        <p className={styles.muted}>{t('updated', { date: document.updated })}</p>
        <Markdown anchors={{ linkLabel: tm('anchorLink') }}>{document.markdown}</Markdown>
      </article>
    );
  };
}
