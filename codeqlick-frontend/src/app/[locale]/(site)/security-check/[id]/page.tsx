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
import {
  getSecurityCheckOrBusy,
  type SecurityCheckReport,
  type SecurityCheckStatus,
} from '@/lib/api/security-checks';
import styles from '../security-check.module.css';
import site from '../../site.module.css';

type PageProps = { params: Promise<{ locale: string; id: string }> };
type Translate = Awaited<ReturnType<typeof getTranslations<'SecurityCheck'>>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKS: Record<SecurityCheckStatus, string> = { pass: '✓', warn: '!', fail: '✕', info: 'i' };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SecurityCheck' });
  // A report is someone's own: never in search results.
  return { title: t('reportMetaTitle'), robots: { index: false, follow: false } };
}

function toneOf(grade: string | null): 'good' | 'fair' | 'poor' {
  if (grade === 'A+' || grade === 'A' || grade === 'B') return 'good';
  return grade === 'C' || grade === 'D' ? 'fair' : 'poor';
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

function CheckItem({
  check,
  t,
}: {
  check: SecurityCheckReport['groups'][number]['checks'][number];
  t: Translate;
}) {
  return (
    <li className={styles.check} data-status={check.status}>
      <span className={styles.mark} aria-hidden="true">
        {MARKS[check.status]}
      </span>
      <div>
        <p className={styles.checkTitle}>
          {check.title}
          <span className={styles.badge}>{t(`report.status.${check.status}`)}</span>
        </p>
        <p className={styles.checkAdvice}>{check.explanation}</p>
        {check.advice ? (
          <p className={styles.checkFix}>
            <strong>{t('report.howToFix')}</strong> {check.advice}
          </p>
        ) : null}
      </div>
    </li>
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
  const tone = toneOf(report.grade);
  const all = report.groups.flatMap((group) => group.checks);
  const toFix = all.filter((check) => check.status === 'fail' || check.status === 'warn').length;
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

      <ul className={styles.categories} aria-label={t('report.groupsLabel')}>
        {report.groups.map((group) => (
          <li key={group.key}>
            <a href={`#${group.key}`}>
              <span>{group.name}</span>
              <span className={styles.categoryScore}>
                {group.checks.filter((c) => c.status === 'fail' || c.status === 'warn').length}
                <span className="visually-hidden"> {t('report.toReviewShort')}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      {report.groups.map((group) => {
        const open = group.checks.filter((check) => check.status !== 'pass');
        const passed = group.checks.filter((check) => check.status === 'pass');
        return (
          <section
            key={group.key}
            id={group.key}
            className={styles.category}
            aria-labelledby={`${group.key}-title`}
          >
            <h2 id={`${group.key}-title`} className={styles.categoryTitle}>
              {group.name}
            </h2>
            {open.length > 0 ? (
              <ul className={styles.checks}>
                {open.map((check) => (
                  <CheckItem key={check.id} check={check} t={t} />
                ))}
              </ul>
            ) : null}
            {passed.length > 0 ? (
              <details className={styles.passed}>
                <summary>{t('report.passedSummary', { count: passed.length })}</summary>
                <ul className={styles.checks}>
                  {passed.map((check) => (
                    <CheckItem key={check.id} check={check} t={t} />
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        );
      })}

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
