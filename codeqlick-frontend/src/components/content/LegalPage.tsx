import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import styles from '@/app/[locale]/(site)/site.module.css';
import { Markdown } from '@/components/markdown/Markdown';
import { legalDocument, type LegalPage as Page } from '@/content/legal';
import { resolveLocale } from '@/i18n/locale';
import { legalOwner } from '@/lib/env';
import { pageMetadata } from '@/lib/seo';

type PageProps = { params: Promise<{ locale: string }> };

/** generateMetadata for a legal page; it isn't indexed until it has an owner. */
export function legalMetadata(page: Page) {
  return async ({ params }: PageProps): Promise<Metadata> => {
    const locale = resolveLocale((await params).locale);
    if (!legalOwner) return { robots: { index: false, follow: false } };
    return pageMetadata({
      locale,
      path: `/${page}`,
      title: legalDocument(page, legalOwner, locale).title,
    });
  };
}

/** The legal notice or privacy policy; a 404 while LEGAL_OWNER_NAME isn't set. */
export function legalPage(page: Page) {
  return async function LegalPage({ params }: PageProps) {
    const locale = resolveLocale((await params).locale);
    setRequestLocale(locale);
    if (!legalOwner) notFound();
    const t = await getTranslations({ locale, namespace: 'Legal' });
    const document = legalDocument(page, legalOwner, locale);

    return (
      <article className={`wrap ${styles.page} ${styles.narrow}`}>
        <h1 className={styles.title}>{document.title}</h1>
        <p className={`lead ${styles.lead}`}>{t('updated', { date: document.updated })}</p>
        <div className={styles.content}>
          <Markdown>{document.markdown}</Markdown>
        </div>
      </article>
    );
  };
}
