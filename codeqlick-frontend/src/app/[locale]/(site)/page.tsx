import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listPortfolio } from '@/lib/api/portfolio';
import type { Locale, PortfolioSummary } from '@/lib/api/types';
import { localeAlternates } from '@/lib/seo';
import { STACK } from '@/lib/site';
import styles from './page.module.css';

const SERVICES = ['web', 'custom', 'mobile', 'design', 'consulting', 'support'] as const;
const STEPS = ['discovery', 'design', 'development', 'qa', 'launch', 'support'] as const;
const VALUES = ['endToEnd', 'quality', 'transparent', 'modern'] as const;

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  return { alternates: localeAlternates(locale) };
}

/** The "Recent projects" section is optional: without published work (or API) it is left out. */
async function featuredWork(locale: Locale): Promise<PortfolioSummary[]> {
  try {
    return (await listPortfolio({ locale, pageSize: 3 })).items;
  } catch {
    return [];
  }
}

export default async function HomePage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Home' });
  const tw = await getTranslations({ locale, namespace: 'Work' });
  const work = await featuredWork(locale);

  return (
    <>
      <section className={styles.hero}>
        <div className="wrap">
          <p className="eyebrow">{t('hero.eyebrow')}</p>
          <h1 className={styles.heroTitle}>{t('hero.title')}</h1>
          <p className={styles.heroSub}>{t('hero.sub')}</p>
          <div className={styles.actions}>
            <Button href="/contact">{t('hero.primary')}</Button>
            <a href="#services" className={buttonClassName({ variant: 'outline' })}>
              {t('hero.secondary')}
            </a>
          </div>
        </div>
      </section>

      <section id="services" className={styles.section} aria-labelledby="services-title">
        <div className="wrap">
          <p className="eyebrow">{t('services.eyebrow')}</p>
          <h2 id="services-title" className={styles.title}>
            {t('services.title')}
          </h2>
          <p className={`lead ${styles.lead}`}>{t('services.lead')}</p>
          <ul className={styles.grid}>
            {SERVICES.map((key) => (
              <Card as="li" bordered key={key}>
                <h3 className={styles.cardTitle}>{t(`services.items.${key}.title`)}</h3>
                <p className={styles.cardBody}>{t(`services.items.${key}.body`)}</p>
              </Card>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${styles.section} ${styles.soft}`} aria-labelledby="process-title">
        <div className="wrap">
          <p className="eyebrow">{t('process.eyebrow')}</p>
          <h2 id="process-title" className={styles.title}>
            {t('process.title')}
          </h2>
          <p className={`lead ${styles.lead}`}>{t('process.lead')}</p>
          <ol className={styles.grid}>
            {STEPS.map((key, index) => (
              <Card as="li" key={key}>
                <span className={styles.step} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.cardTitle}>{t(`process.steps.${key}.title`)}</h3>
                <p className={styles.cardBody}>{t(`process.steps.${key}.body`)}</p>
              </Card>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.dark}`} aria-labelledby="why-title">
        <div className="wrap">
          <p className={`eyebrow ${styles.eyebrowOnDark}`}>{t('why.eyebrow')}</p>
          <h2 id="why-title" className={styles.title}>
            {t('why.title')}
          </h2>
          <p className={`${styles.lead} ${styles.leadOnDark}`}>{t('why.lead')}</p>
          <ul className={`${styles.grid} ${styles.values}`}>
            {VALUES.map((key) => (
              <li key={key} className={styles.value}>
                <h3 className={styles.cardTitle}>{t(`why.values.${key}.title`)}</h3>
                <p>{t(`why.values.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.stack} aria-labelledby="stack-title">
        <div className={`wrap ${styles.stackInner}`}>
          <h2 id="stack-title" className="eyebrow">
            {t('stack.eyebrow')}
          </h2>
          <ul className={styles.pills} aria-label={t('stack.label')}>
            {STACK.map((name) => (
              <li key={name}>
                <Badge>{name}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {work.length > 0 ? (
        <section className={styles.section} aria-labelledby="work-title">
          <div className="wrap">
            <p className="eyebrow">{t('work.eyebrow')}</p>
            <h2 id="work-title" className={styles.title}>
              {t('work.title')}
            </h2>
            <p className={`lead ${styles.lead}`}>{t('work.lead')}</p>
            <ul className={styles.grid}>
              {work.map((item) => (
                <Card as="li" bordered key={item.slug}>
                  <h3 className={styles.cardTitle}>{item.title}</h3>
                  <p className={styles.cardBody}>{item.summary}</p>
                  <Link href={`/work/${item.slug}`} className={styles.more}>
                    {tw('viewCase')}
                    <span className="visually-hidden"> — {item.title}</span>
                  </Link>
                </Card>
              ))}
            </ul>
            <div className={styles.actions}>
              <Button href="/work" variant="outline">
                {t('work.viewAll')}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="cta-title">
        <div className="wrap">
          <div className={styles.cta}>
            <h2 id="cta-title" className={styles.title}>
              {t('contact.title')}
            </h2>
            <p className={styles.lead}>{t('contact.body')}</p>
            <div className={styles.actions}>
              <Button href="/contact" variant="ink">
                {t('contact.cta')}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
