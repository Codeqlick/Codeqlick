import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { NeoqlickIcon } from '@/components/brand/NeoqlickIcon';
import type { NeoqlickIconName } from '@/components/brand/neoqlick-icons';
import styles from '@/components/neoqlick/neoqlick.module.css';
import { Button } from '@/components/ui/Button';
import { resolveCruisingLocale } from '@/i18n/locale';
import { siteLocale } from '@/i18n/routing';
import { BRANDS, CONTACT_EMAIL_NEOQLICK } from '@/lib/brand';
import { NEOQLICK_TAGLINE } from '@/lib/neoqlick-tagline';
import { NEOQLICK_TRADE_NAME, neoqlickLegalOwner } from '@/lib/env';
import { pageMetadata } from '@/lib/seo';
import { neoqlickAccountUrl } from '@/lib/portal-links';
import { webappUrl } from '@/lib/webapp-seo';
import { NEOQLICK_APPS } from '@/lib/webapps';

type PageProps = { params: Promise<{ locale: string }> };

const APP_ICONS: Record<string, NeoqlickIconName> = {
  cruising: 'spot',
  swipe: 'swipe',
  videochat: 'video',
};

/** The brand device: the logo's two circles. */
function Circles({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 36" aria-hidden="true" focusable="false">
      <circle cx="24" cy="18" r="18" fill="#FFFFFF" />
      <circle cx="40" cy="18" r="18" fill="#FF5A7A" />
    </svg>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const base = await pageMetadata({
    locale,
    title: t('defaultTitle'),
    description: `${t('description')} ${NEOQLICK_TAGLINE}`,
  });
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      title: `Neoqlick — ${NEOQLICK_TAGLINE}`,
      images: [{ ...BRANDS.neoqlick.ogImage, alt: `Neoqlick — ${NEOQLICK_TAGLINE}` }],
    },
    title: { absolute: t('defaultTitle') },
    robots: { index: true, follow: true },
  };
}

/** The portal's home: the three apps, safety, the account and the company (architecture 4.18). */
export default async function PortalHomePage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Neoqlick' });
  const tapps = await getTranslations({ locale, namespace: 'AppSwitcher' });
  const accent = (chunks: ReactNode) => <span className={styles.accent}>{chunks}</span>;

  const safety: { key: 'verify' | 'checkin' | 'block'; icon: NeoqlickIconName }[] = [
    { key: 'verify', icon: 'verified' },
    { key: 'checkin', icon: 'checkin' },
    { key: 'block', icon: 'block' },
  ];

  return (
    <>
      <section className={styles.hero} aria-labelledby="portal-title">
        <Circles className={styles.circles} />
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>{t('heroEyebrow')}</p>
          <h1 id="portal-title" className={styles.heroTitle}>
            {t.rich('heroTitle', { accent })}
          </h1>
          <p className={styles.lead}>{t('heroLead')}</p>
          <ul className={styles.cards} aria-label={t('appsLabel')}>
            {NEOQLICK_APPS.map((app) => {
              const name = tapps(`apps.${app}.name`);
              return (
                <li key={app}>
                  <div className={`${styles.card} ${styles.appCard}`}>
                    <span className={styles.cardIcon}>
                      <NeoqlickIcon name={APP_ICONS[app]!} size={32} />
                    </span>
                    <h2 className={styles.cardTitle}>
                      <a
                        href={webappUrl(app, app === 'cruising' ? locale : siteLocale(locale))}
                        className={styles.cardLink}
                        aria-label={t('openApp', { app: name })}
                      >
                        {name}
                      </a>
                    </h2>
                    <p className={styles.cardBody}>{t(`apps.${app}`)}</p>
                    <span className={styles.open} aria-hidden="true">
                      {t('open')} →
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className={styles.eyebrow} style={{ marginTop: 'var(--space-6)', marginBottom: 0 }}>
            {t('adultNote')}
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="portal-safety">
        <div className={styles.wrap}>
          <p className={styles.sectionEyebrow}>{t('safety.eyebrow')}</p>
          <h2 id="portal-safety" className={styles.sectionTitle}>
            {t.rich('safety.title', { accent })}
          </h2>
          <ul className={styles.cards}>
            {safety.map(({ key, icon }) => (
              <li key={key}>
                <div className={`${styles.card} ${styles.safetyCard}`}>
                  <span className={styles.cardIcon}>
                    <NeoqlickIcon name={icon} size={28} />
                  </span>
                  <h3 className={styles.cardTitle}>{t(`safety.${key}.title`)}</h3>
                  <p className={styles.cardBody}>{t(`safety.${key}.body`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="portal-account">
        <Circles className={`${styles.circles} ${styles.circlesLight}`} />
        <div className={styles.wrap}>
          <p className={styles.bandTagline} lang="en">
            {NEOQLICK_TAGLINE}
          </p>
          <h2 id="portal-account">{t('accountTitle')}</h2>
          <p>{t('accountBody')}</p>
          <Button href={neoqlickAccountUrl(locale)} external>
            {t('accountCta')}
          </Button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="portal-company">
        <div className={`${styles.wrap} ${styles.company}`}>
          <div>
            <h2 id="portal-company">{t('companyTitle')}</h2>
            {neoqlickLegalOwner ? (
              <dl>
                <dt>{t('legalLabel')}</dt>
                <dd>{t('operator', { name: neoqlickLegalOwner.name })}</dd>
                {neoqlickLegalOwner.taxId ? (
                  <>
                    <dt>{t('taxId')}</dt>
                    <dd>{neoqlickLegalOwner.taxId}</dd>
                  </>
                ) : null}
                {neoqlickLegalOwner.address ? (
                  <>
                    <dt>{t('address')}</dt>
                    <dd>{neoqlickLegalOwner.address}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p>{NEOQLICK_TRADE_NAME}</p>
            )}
          </div>
          <div>
            <h2>{t('contactTitle')}</h2>
            <p>{t('contactBody', { email: CONTACT_EMAIL_NEOQLICK })}</p>
            <p>
              <a href={`mailto:${CONTACT_EMAIL_NEOQLICK}`}>{CONTACT_EMAIL_NEOQLICK}</a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
