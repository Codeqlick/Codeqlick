import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { MaintenancePlan } from '@/lib/api/types';
import { formatMinutes, formatMonth } from '@/lib/format';
import styles from './PlanUsage.module.css';

/** This month's use of a maintenance plan as a bar, what's left, and the previous months. */
export async function PlanUsage({ plan, locale }: { plan: MaintenancePlan; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Plans' });
  const level =
    plan.percent >= 100 ? styles.full : plan.percent >= plan.alertPercent ? styles.high : styles.ok;

  return (
    <div className={styles.plan}>
      <p className={styles.head}>
        <strong>{plan.name}</strong>
        <span>{t('allowance', { hours: formatMinutes(plan.monthlyMinutes) })}</span>
      </p>
      {/* Decorative: the line below says the same in words. */}
      <div className={styles.track} aria-hidden="true">
        <div
          className={`${styles.fill} ${level}`}
          style={{ width: `${Math.min(100, plan.percent)}%` }}
        />
      </div>
      <p className={styles.numbers}>
        {t('used', {
          used: formatMinutes(plan.usedMinutes),
          total: formatMinutes(plan.monthlyMinutes),
          month: formatMonth(plan.month, locale),
        })}{' '}
        ·{' '}
        {plan.percent >= 100
          ? t('over', { minutes: formatMinutes(plan.usedMinutes - plan.monthlyMinutes) })
          : t('left', { minutes: formatMinutes(plan.remainingMinutes) })}
      </p>
      <ul className={styles.history}>
        {plan.months.slice(1).map((month) => (
          <li key={month.month}>
            <span>{formatMonth(month.month, locale)}</span>
            <span>{month.minutes > 0 ? formatMinutes(month.minutes) : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
