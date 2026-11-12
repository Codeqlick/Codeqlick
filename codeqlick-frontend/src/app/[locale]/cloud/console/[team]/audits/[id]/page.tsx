import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudAudit } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import styles from '../../../../cloud.module.css';

type PageProps = { params: Promise<{ locale: string; team: string; id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  return { title: t('audits.title') };
}

/** One website check's report: the score, each category and its checks with advice. */
export default async function CloudAuditPage({ params }: PageProps) {
  const { locale: raw, team, id } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let report;
  try {
    report = await getCloudAudit(id, locale);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const tone = { pass: 'success', warn: 'warning', fail: 'danger' } as const;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team}/audits`}>← {t('audits.title')}</Link>
        </p>
        <h1 className={styles.heroTitle}>{report.score}/100</h1>
        <p className={styles.mono}>{report.finalUrl}</p>
        <p className={styles.small}>{formatWhen(report.createdAt, locale)}</p>
      </div>
      <div className={styles.meters}>
        {report.categories.map((category) => (
          <div key={category.key} className={`${styles.card} ${styles.meter}`}>
            <span className={styles.small}>{category.name}</span>
            <span className={styles.meterValue}>{category.score}</span>
          </div>
        ))}
      </div>
      {report.categories.map((category) => (
        <section key={category.key} aria-labelledby={`c-${category.key}`}>
          <h2 id={`c-${category.key}`} className={styles.sectionTitle}>
            {category.name}
          </h2>
          <ul className={styles.list}>
            {category.checks.map((check) => (
              <li key={check.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <Badge tone={tone[check.status]}>{t(`audits.status.${check.status}`)}</Badge>
                    {check.title}
                  </p>
                  {check.status !== 'pass' ? <p className={styles.small}>{check.advice}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
