import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import adult from '@/components/adult/adult.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.rules' });
  const title = t('title');
  const description = t('lead');
  return {
    title,
    description,
    alternates: webappAlternates('cruising', locale, '/rules'),
    openGraph: { title, description, url: webappPath('cruising', locale, '/rules') },
  };
}

const RULES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** Cruising's rules, accepted on entry (Cruising.rules; version CRUISING_TERMS_VERSION in the API). */
export default async function CruisingRulesPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.rules' });
  const tl = await getTranslations({ locale, namespace: 'Cruising.legal' });
  return (
    <article className={adult.rules}>
      <h1 className={adult.pageTitle}>{t('title')}</h1>
      <p className={adult.muted}>{t('lead')}</p>
      <ol>
        {RULES.map((n) => (
          <li key={n}>
            <strong>{t(`rule${n}Title`)}.</strong> {t(`rule${n}`)}
          </li>
        ))}
      </ol>
      <h2 className={adult.sectionTitle}>{t('privacyTitle')}</h2>
      <p>{t('privacy')}</p>
      <p>
        <Link href="/cruising/terms-of-use" className={adult.inlineLink}>
          {tl('terms')}
        </Link>
        {' · '}
        <Link href="/cruising/privacy-policy" className={adult.inlineLink}>
          {tl('privacy')}
        </Link>
      </p>
      <h2 className={adult.sectionTitle}>{t('takedownTitle')}</h2>
      <p>
        {t('takedown')}{' '}
        <Link href="/cruising/takedown" className={adult.inlineLink}>
          {t('takedownLink')}
        </Link>
      </p>
    </article>
  );
}
