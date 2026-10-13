import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { BrandSymbol } from '@/components/brand/Symbol';
import { Button } from '@/components/ui/Button';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listPortfolio } from '@/lib/api/portfolio';
import type { Locale, PortfolioSummary } from '@/lib/api/types';
import { localeAlternates } from '@/lib/seo';
import { CONTACT_EMAIL, STACK } from '@/lib/site';
import styles from './page.module.css';

const STEPS = ['discovery', 'design', 'development', 'qa', 'launch', 'support'] as const;
const VALUES = ['endToEnd', 'quality', 'transparent', 'modern'] as const;

/** Services with their icon paths (24×24, stroked), in the order of the approved design. */
const SERVICES: readonly { key: ServiceKey; icon: ReactNode }[] = [
  {
    key: 'web',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 14l-2 2 2 2M16 14l2 2-2 2" />
      </>
    ),
  },
  { key: 'custom', icon: <path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16" /> },
  {
    key: 'mobile',
    icon: (
      <>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </>
    ),
  },
  {
    key: 'design',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18" />
      </>
    ),
  },
  {
    key: 'consulting',
    icon: (
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />
    ),
  },
  {
    key: 'support',
    icon: (
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
    ),
  },
];

type ServiceKey = 'web' | 'custom' | 'mobile' | 'design' | 'consulting' | 'support';

/** Decorative editor window from the approved design. It is code, so it is not translated. */
function CodeWindow() {
  return (
    <div className={styles.visual} aria-hidden="true">
      <div className={styles.code}>
        <div className={styles.dots}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.comment}>{'// your-next-product.ts'}</div>
        <div>
          <span className={styles.keyword}>const</span> idea ={' '}
          <span className={styles.keyword}>await</span> discover(you);
        </div>
        <div>
          <span className={styles.keyword}>const</span> app = build(idea, {'{'}
        </div>
        <div className={styles.indent}>
          quality: <span className={styles.literal}>&quot;high&quot;</span>,
        </div>
        <div className={styles.indent}>
          sprints: <span className={styles.literal}>2</span> {'/* weeks */'}
        </div>
        <div>{'});'}</div>
        <div className={styles.lastLine}>
          ship(app);
          <span className={styles.caret} />
        </div>
      </div>
      <div className={styles.badge}>
        <BrandSymbol size={62} ringColor="#FFFFFF" />
      </div>
    </div>
  );
}

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
      <section className={`wrap ${styles.hero}`}>
        <div className={styles.heroText}>
          <p className={styles.heroEyebrow}>{t('hero.eyebrow')}</p>
          <h1 className={styles.heroTitle}>{t('hero.title')}</h1>
          <p className={styles.heroSub}>{t('hero.sub')}</p>
          <div className={styles.actions}>
            <Button href="/contact">{t('hero.primary')}</Button>
            <a href="#services" className={buttonClassName({ variant: 'outline' })}>
              {t('hero.secondary')}
            </a>
          </div>
        </div>
        <CodeWindow />
      </section>

      <section id="services" className={styles.soft} aria-labelledby="services-title">
        <div className={`wrap ${styles.section}`}>
          <div className={styles.intro}>
            <p className="eyebrow">{t('services.eyebrow')}</p>
            <h2 id="services-title" className={styles.title}>
              {t('services.title')}
            </h2>
            <p className={styles.lead}>{t('services.lead')}</p>
          </div>
          <ul className={styles.services}>
            {SERVICES.map(({ key, icon }) => (
              <li key={key} className={styles.service}>
                <svg
                  className={styles.icon}
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  {icon}
                </svg>
                <h3 className={styles.serviceTitle}>{t(`services.items.${key}.title`)}</h3>
                <p className={styles.serviceBody}>{t(`services.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="process" className={`wrap ${styles.section}`} aria-labelledby="process-title">
        <div className={styles.intro}>
          <p className="eyebrow">{t('process.eyebrow')}</p>
          <h2 id="process-title" className={styles.title}>
            {t('process.title')}
          </h2>
          <p className={styles.lead}>{t('process.lead')}</p>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((key, index) => (
            <li key={key} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className={styles.stepTitle}>{t(`process.steps.${key}.title`)}</h3>
              <p className={styles.stepBody}>{t(`process.steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="why" className={styles.dark} aria-labelledby="why-title">
        <div className={`wrap ${styles.why}`}>
          <div className={styles.whyIntro}>
            <p className={`eyebrow ${styles.eyebrowOnDark}`}>{t('why.eyebrow')}</p>
            <h2 id="why-title" className={styles.title}>
              {t('why.title')}
            </h2>
            <p className={styles.leadOnDark}>{t('why.lead')}</p>
          </div>
          <ul className={styles.values}>
            {VALUES.map((key) => (
              <li key={key} className={styles.value}>
                <h3 className={styles.valueTitle}>{t(`why.values.${key}.title`)}</h3>
                <p>{t(`why.values.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`wrap ${styles.stack}`} aria-labelledby="stack-title">
        <h2 id="stack-title" className={styles.stackLabel}>
          {t('stack.eyebrow')}
        </h2>
        <ul className={styles.pills} aria-label={t('stack.label')}>
          {STACK.map((name) => (
            <li key={name} className={styles.pill}>
              {name}
            </li>
          ))}
        </ul>
      </section>

      {work.length > 0 ? (
        <section className={`wrap ${styles.section} ${styles.work}`} aria-labelledby="work-title">
          <div className={styles.intro}>
            <p className="eyebrow">{t('work.eyebrow')}</p>
            <h2 id="work-title" className={styles.title}>
              {t('work.title')}
            </h2>
            <p className={styles.lead}>{t('work.lead')}</p>
          </div>
          <ul className={`${styles.services} ${styles.workGrid}`}>
            {work.map((item) => (
              <li key={item.slug} className={`${styles.service} ${styles.workItem}`}>
                <h3 className={styles.serviceTitle}>{item.title}</h3>
                <p className={styles.serviceBody}>{item.summary}</p>
                <Link href={`/work/${item.slug}`} className={styles.more}>
                  {tw('viewCase')}
                  <span className="visually-hidden"> — {item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div>
            <Button href="/work" variant="outline">
              {t('work.viewAll')}
            </Button>
          </div>
        </section>
      ) : null}

      <section className={styles.ctaSection} aria-labelledby="cta-title">
        <div className={styles.cta}>
          <div className={styles.ctaText}>
            <h2 id="cta-title" className={styles.ctaTitle}>
              {t('contact.title')}
            </h2>
            <p className={styles.ctaBody}>{t('contact.body')}</p>
          </div>
          <div className={styles.ctaActions}>
            <Button href="/contact" variant="ink" block>
              {t('contact.cta')}
            </Button>
            <a href={`mailto:${CONTACT_EMAIL}`} className={styles.ctaEmail}>
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
