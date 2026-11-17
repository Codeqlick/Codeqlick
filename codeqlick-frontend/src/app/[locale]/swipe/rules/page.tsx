import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import adult from '@/components/adult/adult.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Swipe.rules' });
  const title = t('title');
  const description = t('lead');
  return {
    title,
    description,
    alternates: webappAlternates('swipe', locale, '/rules'),
    openGraph: { title, description, url: webappPath('swipe', locale, '/rules') },
  };
}

const RULES = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

/** Swipe's rules, accepted on entry (Swipe.rules; version SWIPE_TERMS_VERSION in the API). */
export default async function SwipeRulesPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Swipe.rules' });
  const tl = await getTranslations({ locale, namespace: 'Swipe.legal' });
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
        <Link href="/swipe/terms-of-use" className={adult.inlineLink}>
          {tl('terms')}
        </Link>
        {' · '}
        <Link href="/swipe/privacy-policy" className={adult.inlineLink}>
          {tl('privacy')}
        </Link>
      </p>
      <h2 className={adult.sectionTitle}>{t('takedownTitle')}</h2>
      <p>
        {t('takedown')}{' '}
        <Link href="/swipe/takedown" className={adult.inlineLink}>
          {t('takedownLink')}
        </Link>
      </p>
    </article>
  );
}
