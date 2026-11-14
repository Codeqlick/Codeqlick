import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Markdown } from '@/components/markdown/Markdown';
import { cloudTermsDocument } from '@/content/legal/cloud';
import { resolveLocale } from '@/i18n/locale';
import { env, legalOwner } from '@/lib/env';
import { SITE_NAME } from '@/lib/site';
import { webappAlternates } from '@/lib/webapp-seo';
import styles from '../cloud.module.css';

type PageProps = { params: Promise<{ locale: string }> };

const owner = () => legalOwner ?? { name: SITE_NAME };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const document = cloudTermsDocument(owner(), locale, env.CLOUD_HOSTING_DOMAIN);
  return {
    title: document.title,
    description: document.description,
    alternates: webappAlternates('cloud', locale, '/terms-of-use'),
  };
}

/** Codeqlick Cloud's terms, accepted when creating or joining a team (architecture 4.13). */
export default async function CloudTermsPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Legal' });
  const tm = await getTranslations({ locale, namespace: 'Markdown' });
  const document = cloudTermsDocument(owner(), locale, env.CLOUD_HOSTING_DOMAIN);
  return (
    <article className={styles.docs}>
      <h1 className={styles.heroTitle}>{document.title}</h1>
      <p className={styles.muted}>{t('updated', { date: document.updated })}</p>
      <Markdown anchors={{ linkLabel: tm('anchorLink') }}>{document.markdown}</Markdown>
    </article>
  );
}
