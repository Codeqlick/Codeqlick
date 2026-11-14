import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Markdown } from '@/components/markdown/Markdown';
import { cloudDocs } from '@/content/cloud-docs';
import { resolveLocale } from '@/i18n/locale';
import { cloudDocsUrl } from '@/lib/cloud-docs-url';
import { env } from '@/lib/env';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import styles from '../cloud.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const title = t('nav.docs');
  return {
    title,
    alternates: webappAlternates('cloud', locale, '/docs'),
    openGraph: { title, url: webappPath('cloud', locale, '/docs') },
  };
}

/** Codeqlick Cloud's documentation: getting started, the CLI, deployments, domains, CI, API. */
export default async function CloudDocsPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  // With the public documentation site set up, this page is a temporary (307) redirect to it.
  if (env.CLOUD_DOCS_URL) redirect(cloudDocsUrl(locale));
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  return (
    <article className={styles.docs}>
      <p className={styles.eyebrow}>{t('landing.eyebrow')}</p>
      <h1 className={styles.heroTitle}>{t('nav.docs')}</h1>
      <Markdown>{cloudDocs(locale, env.CLOUD_HOSTING_DOMAIN, env.PUBLIC_API_URL)}</Markdown>
    </article>
  );
}
