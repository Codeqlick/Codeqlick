import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { AdZone } from '@/components/videochat/AdZone';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCurrentUser } from '@/lib/auth/session';
import vc from '../videochat/videochat.module.css';

type PageProps = { params: Promise<{ locale: string }> };

/** swipe.codeqlick.com: what it is, the adult-content warning, and the way in. */
export default async function SwipeLandingPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Swipe.landing' });
  const user = await getCurrentUser();
  const deck = `/${locale}/swipe/deck`;

  return (
    <div className={vc.landing}>
      <section className={vc.hero}>
        <p className={vc.eyebrow}>{t('eyebrow')}</p>
        <h1 className={vc.heroTitle}>{t('title')}</h1>
        <p className={vc.heroLead}>{t('lead')}</p>
        <div className={vc.warning} role="note">
          <strong>{t('warningTitle')}.</strong> {t('warning')}
        </div>
        <div className={vc.actions}>
          {user ? (
            <Button href="/swipe/deck">{t('enter')}</Button>
          ) : (
            <>
              <Button href={`/login?next=${encodeURIComponent(deck)}`}>{t('signIn')}</Button>
              <Button href="/register" variant="outline">
                {t('createAccount')}
              </Button>
            </>
          )}
          <a className={vc.leaveLink} href="https://www.google.com" rel="noreferrer">
            {t('leave')}
          </a>
        </div>
      </section>

      <section className={vc.columns}>
        <div>
          <h2 className={vc.sectionTitle}>{t('howTitle')}</h2>
          <ol className={vc.steps}>
            {(['1', '2', '3'] as const).map((n) => (
              <li key={n}>
                <strong>{t(`how${n}Title`)}</strong>
                <span>{t(`how${n}`)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className={vc.sectionTitle}>{t('safetyTitle')}</h2>
          <ul className={vc.safety}>
            {(['1', '2', '3', '4'] as const).map((n) => (
              <li key={n}>{t(`safety${n}`)}</li>
            ))}
          </ul>
          <p>
            <Link href="/swipe/takedown" className={vc.inlineLink}>
              {t('takedownLink')}
            </Link>
          </p>
        </div>
      </section>
      <AdZone app="swipe" zone="pages" />
    </div>
  );
}
