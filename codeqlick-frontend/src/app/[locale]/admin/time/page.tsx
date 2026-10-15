import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminGetMonthTime } from '@/lib/api/time';
import { firstParam, formatDate, formatMinutes, formatMonth, madridToday } from '@/lib/format';

/** `yyyy-mm` moved by `delta` months. */
function shift(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, number - 1 + delta, 15));
  return date.toISOString().slice(0, 7);
}

export default async function AdminTimePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Hours' });
  const current = madridToday().slice(0, 7);
  const requested = firstParam((await searchParams).month);
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : current;
  const data = await adminGetMonthTime(month);

  return (
    <>
      <PageHeader
        title={t('pageTitle')}
        lead={t('pageLead')}
        actions={
          <>
            <Link
              href={`/admin/time?month=${shift(month, -1)}`}
              className={buttonClassName({ variant: 'outline', size: 'sm' })}
            >
              ← {formatMonth(shift(month, -1), locale)}
            </Link>
            {month < current ? (
              <Link
                href={`/admin/time?month=${shift(month, 1)}`}
                className={buttonClassName({ variant: 'outline', size: 'sm' })}
              >
                {formatMonth(shift(month, 1), locale)} →
              </Link>
            ) : null}
          </>
        }
      />
      <div className={styles.stack}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {t('monthTotal', {
              month: formatMonth(month, locale),
              total: formatMinutes(data.totalMinutes),
            })}
          </h2>
          {data.projects.length === 0 ? (
            <EmptyState title={t('monthEmptyTitle')} body={t('monthEmptyBody')} />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('project')}</th>
                    <th scope="col">{t('client')}</th>
                    <th scope="col">{t('duration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((project) => (
                    <tr key={project.id}>
                      <th scope="row">
                        <Link href={`/admin/projects/${project.id}#time`}>{project.name}</Link>
                      </th>
                      <td>{project.client.name}</td>
                      <td>{formatMinutes(project.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {data.entries.length > 0 ? (
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('entries')}</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('date')}</th>
                    <th scope="col">{t('project')}</th>
                    <th scope="col">{t('description')}</th>
                    <th scope="col">{t('duration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.date, locale)}</td>
                      <td>{entry.project.name}</td>
                      <td>
                        {entry.description}
                        <span className={styles.sub}>{entry.author.name}</span>
                      </td>
                      <td>{formatMinutes(entry.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
