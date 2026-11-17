import { PageHeader } from '@/components/ui/PageHeader';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import adult from '@/components/adult/adult.module.css';
import appUi from '@/components/layout/AppPage.module.css';

type PageProps = { params: Promise<{ locale: string }> };

/** cruising.codeqlick.com: what it is, the adults-only warning, how it stays safe, the way in. */
export default async function CruisingLandingPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.landing' });

  return (
    <div className={adult.landing}>
      <section>
        <PageHeader
          variant="hero"
          eyebrow={t('eyebrow')}
          title={t('title')}
          lead={t('lead')}
          actions={
            <>
              <Button href="/cruising/map">{t('openMap')}</Button>
              <Button href="/cruising/places" variant="outline">
                {t('browsePlaces')}
              </Button>
              <a className={adult.leaveLink} href="https://www.google.com" rel="noreferrer">
                {t('leave')}
              </a>
            </>
          }
        >
          <div className={adult.warning} role="note">
            <strong>{t('warningTitle')}.</strong> {t('warning')}{' '}
            <Link href="/cruising/rules" className={adult.inlineLink}>
              {t('rulesLink')}
            </Link>
          </div>
        </PageHeader>
      </section>

      <section className={adult.columns}>
        <div>
          <h2 className={adult.sectionTitle}>{t('howTitle')}</h2>
          <ol className={adult.steps}>
            {(['1', '2', '3'] as const).map((n) => (
              <li key={n}>
                <strong>{t(`how${n}Title`)}</strong>
                <span>{t(`how${n}`)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className={adult.sectionTitle}>{t('safetyTitle')}</h2>
          <ul className={adult.safety}>
            {(['1', '2', '3', '4'] as const).map((n) => (
              <li key={n}>{t(`safety${n}`)}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className={adult.sectionTitle}>{t('joinTitle')}</h2>
        <p className={adult.muted}>{t('join')}</p>
        <div className={appUi.actions}>
          <Button href="/cruising/new" variant="outline">
            {t('propose')}
          </Button>
        </div>
      </section>
    </div>
  );
}
