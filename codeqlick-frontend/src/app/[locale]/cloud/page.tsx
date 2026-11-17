import { PageHeader } from '@/components/ui/PageHeader';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { getCurrentUser } from '@/lib/auth/session';
import { cloudDocsUrl } from '@/lib/cloud-docs-url';
import { env } from '@/lib/env';
import appUi from '@/components/layout/AppPage.module.css';
import styles from './cloud.module.css';

type PageProps = { params: Promise<{ locale: string }> };

type Feature = { title: string; body: string };

/** cloud.codeqlick.com: what Codeqlick Cloud is, the free plan and the way in. */
export default async function CloudLandingPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const user = await getCurrentUser();
  const plan = t.raw('landing.plan') as string[];
  const features = t.raw('landing.features') as Feature[];

  return (
    <div className={styles.landing}>
      <section className={appUi.split}>
        <PageHeader
          variant="hero"
          eyebrow={t('landing.eyebrow')}
          title={t('landing.title')}
          lead={t('landing.lead')}
          actions={
            <>
              {user ? (
                <Button href="/cloud/console">{t('landing.start')}</Button>
              ) : (
                <Button href={`/register?next=/${locale}/cloud/console`}>
                  {t('landing.createAccount')}
                </Button>
              )}
              <Button href={cloudDocsUrl(locale)} variant="outline">
                {t('landing.docs')}
              </Button>
            </>
          }
        />
        <div className={appUi.card}>
          <h2 className={appUi.cardTitle}>{t('landing.planTitle')}</h2>
          <ul className={styles.checks}>
            {plan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title" className={appUi.sectionTitle}>
          {t('landing.howTitle')}
        </h2>
        <pre className={styles.terminal}>
          <span className={styles.prompt}>$ </span>npx @codeqlick/cli login{'\n'}
          <span className={styles.prompt}>$ </span>npx @codeqlick/cli init{'\n'}
          <span className={styles.prompt}>$ </span>npx @codeqlick/cli deploy dist --prod{'\n'}
          <span className={styles.comment}>✓ https://my-site.{env.CLOUD_HOSTING_DOMAIN}</span>
        </pre>
      </section>

      <section>
        <ul className={styles.features}>
          {features.map((feature) => (
            <li key={feature.title} className={appUi.card}>
              <h2 className={appUi.cardTitle}>{feature.title}</h2>
              <p className={styles.muted}>{feature.body}</p>
            </li>
          ))}
        </ul>
        <p className={`${styles.small} ${styles.spaced}`}>{t('landing.phase')}</p>
      </section>
    </div>
  );
}
