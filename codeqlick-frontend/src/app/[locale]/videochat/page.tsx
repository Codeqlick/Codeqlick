import { getTranslations } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { Button } from '@/components/ui/Button';
import { AdZone } from '@/components/videochat/AdZone';
import { InstallApp } from '@/components/videochat/InstallApp';
import { resolveLocale } from '@/i18n/locale';
import { getVideochatOnline } from '@/lib/api/videochat';
import { getCurrentUser } from '@/lib/auth/session';
import { SITE_NAME, SOCIAL_LINKS } from '@/lib/site';
import { webappOrigin, webappUrl } from '@/lib/webapp-seo';
import styles from './videochat.module.css';

type PageProps = { params: Promise<{ locale: string }> };
type Feature = { title: string; body: string };
type Question = { q: string; a: string };

/** What search engines read about the video chat: the app, who runs it, and the FAQ shown below. */
function structuredData(locale: string, name: string, description: string, faq: Question[]) {
  const url = webappUrl('videochat', locale);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}#app`,
        name,
        description,
        url,
        inLanguage: locale,
        applicationCategory: 'SocialNetworkingApplication',
        operatingSystem: 'Web, Android, iOS, Windows, macOS',
        browserRequirements: 'A camera and a modern browser (WebRTC)',
        isFamilyFriendly: false,
        audience: { '@type': 'PeopleAudience', suggestedMinAge: 18 },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        publisher: { '@id': `${webappOrigin('videochat')}#org` },
      },
      {
        '@type': 'Organization',
        '@id': `${webappOrigin('videochat')}#org`,
        name: SITE_NAME,
        url: 'https://codeqlick.com',
        sameAs: SOCIAL_LINKS.map((link) => link.href),
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        inLanguage: locale,
        mainEntity: faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  };
}

/** videochat.codeqlick.com: what it is, the adult-content warning, and the way in. */
export default async function VideochatLandingPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Videochat.landing' });
  const user = await getCurrentUser();
  const room = `/${locale}/videochat/room`;
  const online = await getVideochatOnline();
  const meta = await getTranslations({ locale, namespace: 'Videochat' });
  const features = t.raw('features') as Feature[];
  const faq = t.raw('faq') as Question[];

  return (
    <div className={styles.landing}>
      <JsonLd data={structuredData(locale, meta('metaSuffix'), meta('metaDescription'), faq)} />
      <section className={styles.hero}>
        <p className={styles.eyebrow}>{t('eyebrow')}</p>
        {online !== null ? (
          <p className={styles.online} aria-live="polite">
            {t('online', { count: online })}
          </p>
        ) : null}
        <h1 className={styles.heroTitle}>{t('title')}</h1>
        <p className={styles.heroLead}>{t('lead')}</p>

        <div className={styles.warning} role="note">
          <strong>{t('warningTitle')}.</strong> {t('warning')}
        </div>

        <div className={styles.actions}>
          {user ? (
            <Button href="/videochat/room">{t('enter')}</Button>
          ) : (
            <>
              <Button href={`/login?next=${encodeURIComponent(room)}`}>{t('signIn')}</Button>
              <Button href="/register" variant="outline">
                {t('createAccount')}
              </Button>
            </>
          )}
          <a className={styles.leaveLink} href="https://www.google.com" rel="noreferrer">
            {t('leave')}
          </a>
        </div>
        {user ? null : <p className={styles.note}>{t('accountNote')}</p>}
        <InstallApp className={styles.install} />
      </section>

      <section className={styles.columns}>
        <div>
          <h2 className={styles.sectionTitle}>{t('howTitle')}</h2>
          <ol className={styles.steps}>
            {(['1', '2', '3'] as const).map((n) => (
              <li key={n}>
                <strong>{t(`how${n}Title`)}</strong>
                <span>{t(`how${n}`)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className={styles.sectionTitle}>{t('safetyTitle')}</h2>
          <ul className={styles.safety}>
            {(['1', '2', '3', '4'] as const).map((n) => (
              <li key={n}>{t(`safety${n}`)}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>{t('featuresTitle')}</h2>
        <ul className={styles.features}>
          {features.map((feature) => (
            <li key={feature.title}>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p>{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>{t('faqTitle')}</h2>
        <div className={styles.faq}>
          {faq.map(({ q, a }) => (
            <details key={q} className={styles.faqItem}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <AdZone zone="pages" />
    </div>
  );
}
