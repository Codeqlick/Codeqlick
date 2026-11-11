import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { resolveLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import { isNotFound } from '@/lib/api/errors';
import { getSiteAudit, type SiteAuditReport } from '@/lib/api/site-audits';
import styles from '../website-check.module.css';
import site from '../../site.module.css';

type PageProps = { params: Promise<{ locale: string; id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKS = { pass: '✓', warn: '!', fail: '✕' } as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'WebsiteCheck' });
  // A report is someone's own: never in search results.
  return { title: t('reportMetaTitle'), robots: { index: false, follow: false } };
}

function gradeOf(score: number): 'good' | 'fair' | 'poor' {
  return score >= 85 ? 'good' : score >= 60 ? 'fair' : 'poor';
}

/** The free website check's report (architecture 4.12); refreshes itself while it runs. */
export default async function WebsiteCheckReportPage({ params }: PageProps) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const t = await getTranslations({ locale, namespace: 'WebsiteCheck' });

  let report: SiteAuditReport;
  try {
    report = await getSiteAudit(id, locale);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const host = new URL(report.finalUrl ?? report.url).host;

  return (
    <section className={`wrap ${styles.page}`}>
      <Link href="/website-check" className={site.back}>
        {t('report.back')}
      </Link>

      {report.status === 'PENDING' ? (
        <>
          <AutoRefresh seconds={3} />
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={styles.reportTitle}>{t('report.pendingTitle', { host })}</h1>
          <output className={styles.waiting}>
            <span className={styles.spinner} aria-hidden="true" />
            <p>{t('report.pendingBody')}</p>
          </output>
        </>
      ) : report.status === 'FAILED' ? (
        <>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={styles.reportTitle}>{t('report.failedTitle', { host })}</h1>
          <Alert tone="error">{report.failure}</Alert>
          <div className={styles.actions}>
            <Button href="/website-check">{t('report.tryAgain')}</Button>
            <Button href="/contact" variant="outline">
              {t('report.contact')}
            </Button>
          </div>
        </>
      ) : (
        <Done report={report} host={host} locale={locale} t={t} />
      )}
    </section>
  );
}

function Done({
  report,
  host,
  locale,
  t,
}: {
  report: SiteAuditReport;
  host: string;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<'WebsiteCheck'>>>;
}) {
  const score = report.score ?? 0;
  const grade = gradeOf(score);
  const problems = report.categories.reduce(
    (sum, category) => sum + category.checks.filter((check) => check.status !== 'pass').length,
    0,
  );
  const checkedOn = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(report.finishedAt ?? report.createdAt),
  );
  const message = t('report.contactMessage', { url: report.url, score });

  return (
    <>
      <div className={styles.reportHead}>
        <div
          className={styles.score}
          data-grade={grade}
          style={{ '--value': score } as React.CSSProperties}
        >
          <span className="visually-hidden">{t('report.scoreLabel', { score })}</span>
          <span className={styles.scoreValue} aria-hidden="true">
            {score}
            <small>/100</small>
          </span>
        </div>
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={styles.reportTitle}>{t(`report.grade.${grade}`, { host })}</h1>
          <p className={styles.reportMeta}>
            {t('report.summary', { count: problems, date: checkedOn })}
          </p>
        </div>
      </div>

      <ul className={styles.categories} aria-label={t('report.categoriesLabel')}>
        {report.categories.map((category) => (
          <li key={category.key}>
            <a href={`#${category.key}`}>
              <span>{category.name}</span>
              <span className={styles.categoryScore}>{category.score}</span>
            </a>
          </li>
        ))}
      </ul>

      {report.categories.map((category) => (
        <section
          key={category.key}
          id={category.key}
          className={styles.category}
          aria-labelledby={`${category.key}-title`}
        >
          <h2 id={`${category.key}-title`} className={styles.categoryTitle}>
            <span>{category.name}</span>
            <span>{category.score}/100</span>
          </h2>
          <ul className={styles.checks}>
            {category.checks.map((check) => (
              <li key={check.id} className={styles.check} data-status={check.status}>
                <span className={styles.mark} aria-hidden="true">
                  {MARKS[check.status]}
                </span>
                <div>
                  <p className={styles.checkTitle}>
                    {check.title}
                    <span className="visually-hidden"> — {t(`report.status.${check.status}`)}</span>
                  </p>
                  <p className={styles.checkAdvice}>{check.advice}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Card tone="blush" className={styles.category}>
        <h2 className={styles.asideTitle}>{t('report.ctaTitle')}</h2>
        <p>{t('report.ctaBody')}</p>
        <div className={styles.actions}>
          <Button
            href={`/contact?type=web&message=${encodeURIComponent(message)}`}
            data-umami-event="website-check-contact"
          >
            {t('report.ctaContact')}
          </Button>
          <Button href="/basic-website" variant="outline" data-umami-event="website-check-basic">
            {t('report.ctaBasic')}
          </Button>
        </div>
      </Card>
    </>
  );
}
