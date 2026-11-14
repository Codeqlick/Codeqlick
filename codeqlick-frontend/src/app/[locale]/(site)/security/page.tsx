import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Markdown } from '@/components/markdown/Markdown';
import { SECURITY_UPDATED, securityPage } from '@/content/security';
import { resolveLocale } from '@/i18n/locale';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from '../site.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const { title, description } = securityPage(locale);
  return pageMetadata({ locale, path: '/security', title, description });
}

/** How to report a vulnerability (architecture 6, "Security page"). */
export default async function SecurityPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Legal' });
  const tm = await getTranslations({ locale, namespace: 'Markdown' });
  const page = securityPage(locale);

  return (
    <article className={`wrap ${styles.page} ${styles.narrow}`}>
      <h1 className={styles.title}>{page.title}</h1>
      <p className={`lead ${styles.lead}`}>
        {t('updated', { date: formatDate(SECURITY_UPDATED, locale) })}
      </p>
      <div className={styles.content}>
        <Markdown anchors={{ linkLabel: tm('anchorLink') }}>{page.markdown}</Markdown>
      </div>
    </article>
  );
}
