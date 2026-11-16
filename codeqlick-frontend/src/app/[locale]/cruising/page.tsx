import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import vc from '../videochat/videochat.module.css';

type PageProps = { params: Promise<{ locale: string }> };

/** cruising.codeqlick.com: what it is, the adults-only warning, how it stays safe, the way in. */
export default async function CruisingLandingPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.landing' });

  return (
    <div className={vc.landing}>
      <section className={vc.hero}>
        <p className={vc.eyebrow}>{t('eyebrow')}</p>
        <h1 className={vc.heroTitle}>{t('title')}</h1>
        <p className={vc.heroLead}>{t('lead')}</p>
        <div className={vc.warning} role="note">
          <strong>{t('warningTitle')}.</strong> {t('warning')}{' '}
          <Link href="/cruising/rules" className={vc.inlineLink}>
            {t('rulesLink')}
          </Link>
        </div>
        <div className={vc.actions}>
          <Button href="/cruising/map">{t('openMap')}</Button>
          <Button href="/cruising/places" variant="outline">
            {t('browsePlaces')}
          </Button>
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
            <Link href="/cruising/takedown" className={vc.inlineLink}>
              {t('takedownLink')}
            </Link>
          </p>
        </div>
      </section>

      <section>
        <h2 className={vc.sectionTitle}>{t('joinTitle')}</h2>
        <p className={vc.muted}>{t('join')}</p>
        <div className={vc.actions}>
          <Button href="/cruising/new" variant="outline">
            {t('propose')}
          </Button>
        </div>
      </section>
    </div>
  );
}
