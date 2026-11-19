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
import { getSecurityCheckOrBusy, type SecurityCheckReport } from '@/lib/api/security-checks';
import { gradeTone, pointsToFix, SecurityFindings } from '../SecurityFindings';
import styles from '../security-check.module.css';
import site from '../../site.module.css';

type PageProps = { params: Promise<{ locale: string; id: string }> };
type Translate = Awaited<ReturnType<typeof getTranslations<'SecurityCheck'>>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SecurityCheck' });
  // A report is someone's own: never in search results.
  return { title: t('reportMetaTitle'), robots: { index: false, follow: false } };
}

/** The free Security check's report (architecture 4.19); refreshes itself while it runs. */
export default async function SecurityCheckReportPage({ params }: PageProps) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const t = await getTranslations({ locale, namespace: 'SecurityCheck' });

  let report: SecurityCheckReport;
  try {
    // Rate-limited (429): show it as still running and ask again.
    report = (await getSecurityCheckOrBusy(id, locale)) ?? {
      id,
      domain: '',
      status: 'PENDING',
      score: null,
      grade: null,
      failure: null,
      groups: [],
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const host = report.domain || '…';

  return (
    <section className={`wrap ${styles.page}`}>
      <Link href="/security-check" className={site.back}>
        {t('report.back')}
      </Link>

      {report.status === 'PENDING' ? (
        <>
          <AutoRefresh seconds={5} />
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
          <Alert tone="error">{report.failure ?? t('report.failedFallback')}</Alert>
          <div className={styles.actions}>
            <Button href="/security-check">{t('report.tryAgain')}</Button>
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
  report: SecurityCheckReport;
  host: string;
  locale: string;
  t: Translate;
}) {
  const score = report.score ?? 0;
  const grade = report.grade ?? '–';
  const tone = gradeTone(report.grade);
  const toFix = pointsToFix(report.groups);
  const checkedOn = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(report.finishedAt ?? report.createdAt),
  );
  const message = t('report.contactMessage', { domain: host, grade, score });

  return (
    <>
      <div className={styles.reportHead}>
        <div
          className={styles.score}
          data-grade={tone}
          style={{ '--value': score } as React.CSSProperties}
        >
          <span className="visually-hidden">{t('report.gradeLabel', { grade, score })}</span>
          <span aria-hidden="true">
            <span className={styles.grade}>{grade}</span>
            <span className={styles.gradePoints}>{score}/100</span>
          </span>
        </div>
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={styles.reportTitle}>{t(`report.tone.${tone}`, { host })}</h1>
          <p className={styles.reportMeta}>
            {t('report.summary', { count: toFix, date: checkedOn })}
          </p>
        </div>
      </div>

      <p className={styles.note}>{t('passiveNote')}</p>

      <SecurityFindings groups={report.groups} />

      <Card tone="blush" className={styles.category}>
        <h2 className={styles.asideTitle}>{t('report.ctaTitle')}</h2>
        <p>{t('report.ctaBody')}</p>
        <div className={styles.actions}>
          <Button
            href={`/contact?message=${encodeURIComponent(message)}`}
            data-umami-event="security-check-contact"
          >
            {t('report.ctaContact')}
          </Button>
        </div>
      </Card>
    </>
  );
}
