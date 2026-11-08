import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { resolveLocale } from '@/i18n/locale';
import { pageMetadata } from '@/lib/seo';
import home from '../page.module.css';
import { ContactCta } from '../services/ContactCta';
import services from '../services/services.module.css';
import styles from './apps.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Apps' });
  return pageMetadata({
    locale,
    path: '/apps',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

/** Codeqlick's own web apps (architecture 6.3), each opening on its subdomain. */
export default async function AppsPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Apps' });

  return (
    <>
      <header className={`wrap ${services.header}`}>
        <div className={home.intro}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={home.title}>{t('title')}</h1>
          <p className={home.lead}>{t('lead')}</p>
        </div>
      </header>

      <section className={`wrap ${home.section}`} aria-label={t('listLabel')}>
        <ul className={styles.apps}>
          <li className={`${home.service} ${styles.card}`}>
            <div className={styles.head}>
              <h2 className={home.serviceTitle}>{t('videochat.title')}</h2>
              <Badge tone="danger">{t('videochat.adult')}</Badge>
            </div>
            <p className={home.serviceBody}>{t('videochat.body')}</p>
            <p className={styles.warning}>{t('videochat.warning')}</p>
            {/* A plain link: the proxy sends /{locale}/videochat to the app's own host. */}
            <a
              href={`/${locale}/videochat`}
              className={buttonClassName({})}
              data-umami-event="apps-videochat"
            >
              {t('videochat.open')}
            </a>
          </li>
          <li className={`${home.service} ${styles.card}`}>
            <div className={styles.head}>
              <h2 className={home.serviceTitle}>{t('meetings.title')}</h2>
              <Badge>{t('meetings.badge')}</Badge>
            </div>
            <p className={home.serviceBody}>{t('meetings.body')}</p>
            <a
              href={`/${locale}/meetings`}
              className={buttonClassName({})}
              data-umami-event="apps-meetings"
            >
              {t('meetings.open')}
            </a>
          </li>
          <li className={`${home.service} ${styles.card}`}>
            <div className={styles.head}>
              <h2 className={home.serviceTitle}>{t('citas.title')}</h2>
              <Badge>{t('citas.badge')}</Badge>
            </div>
            <p className={home.serviceBody}>{t('citas.body')}</p>
            <a
              href={`/${locale}/citas`}
              className={buttonClassName({})}
              data-umami-event="apps-citas"
            >
              {t('citas.open')}
            </a>
          </li>
        </ul>
      </section>

      <ContactCta locale={locale} />
    </>
  );
}
