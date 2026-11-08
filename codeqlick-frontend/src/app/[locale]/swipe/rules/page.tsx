import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import vc from '../../videochat/videochat.module.css';

type PageProps = { params: Promise<{ locale: string }> };

const RULES = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

/** Swipe's rules, accepted on entry (Swipe.rules; version SWIPE_TERMS_VERSION in the API). */
export default async function SwipeRulesPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Swipe.rules' });
  return (
    <article className={vc.rules}>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{t('lead')}</p>
      <ol>
        {RULES.map((n) => (
          <li key={n}>
            <strong>{t(`rule${n}Title`)}.</strong> {t(`rule${n}`)}
          </li>
        ))}
      </ol>
      <h2 className={vc.sectionTitle}>{t('privacyTitle')}</h2>
      <p>{t('privacy')}</p>
      <h2 className={vc.sectionTitle}>{t('takedownTitle')}</h2>
      <p>
        {t('takedown')}{' '}
        <Link href="/swipe/takedown" className={vc.inlineLink}>
          {t('takedownLink')}
        </Link>
      </p>
    </article>
  );
}
