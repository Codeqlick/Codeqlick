import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { ProjectTime } from '@/lib/api/types';
import { formatDate, formatMinutes, formatMonth } from '@/lib/format';
import { ActionForm, type FormAction } from './ActionForm';
import styles from './app.module.css';
import hours from './ProjectHours.module.css';

/**
 * The hours of a project: the total, a total per month and the entries, newest first. The admin
 * panel passes `deleteAction` to add a delete button per entry.
 */
export async function ProjectHours({
  time,
  locale,
  empty,
  deleteAction,
}: {
  time: ProjectTime;
  locale: AppLocale;
  empty: string;
  deleteAction?: (entryId: string) => FormAction;
}) {
  const t = await getTranslations({ locale, namespace: 'Hours' });
  if (time.entries.length === 0) return <p className={styles.muted}>{empty}</p>;

  return (
    <div className={styles.stack}>
      <dl className={hours.totals}>
        <div className={hours.total}>
          <dt>{t('total')}</dt>
          <dd>{formatMinutes(time.totalMinutes)}</dd>
        </div>
        {time.months.slice(0, 6).map((month) => (
          <div key={month.month}>
            <dt>{formatMonth(month.month, locale)}</dt>
            <dd>{formatMinutes(month.minutes)}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={hours.wide}>
                {t('date')}
              </th>
              <th scope="col">{t('description')}</th>
              <th scope="col">{t('duration')}</th>
            </tr>
          </thead>
          <tbody>
            {time.entries.map((entry) => (
              <tr key={entry.id}>
                <td className={`${hours.nowrap} ${hours.wide}`}>
                  {formatDate(entry.date, locale)}
                </td>
                <td>
                  {entry.description}
                  {/* Phones drop the date column: the date goes under the description. */}
                  <span className={`${styles.sub} ${hours.narrow}`}>
                    {formatDate(entry.date, locale)}
                  </span>
                  {deleteAction ? <span className={styles.sub}>{entry.author.name}</span> : null}
                </td>
                <td className={hours.nowrap}>
                  {/* The delete button sits next to the time: a cell of its own would be unlabeled. */}
                  <div className={hours.duration}>
                    {formatMinutes(entry.minutes)}
                    {deleteAction ? (
                      <ActionForm action={deleteAction(entry.id)}>
                        <SubmitButton variant="ghost" size="sm" pendingLabel={t('deleting')}>
                          {t('delete')}
                          <span className="visually-hidden"> — {entry.description}</span>
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
