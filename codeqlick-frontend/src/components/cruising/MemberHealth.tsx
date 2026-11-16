import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { formatMonth, type MemberHealth as Health } from '@/lib/cruising-safety';
import cruising from './Cruising.module.css';
import styles from './CruisingSafety.module.css';

/** A member's sexual health on their profile: only what they chose to show (decision 94). */
export async function MemberHealth({
  locale,
  health,
}: {
  locale: AppLocale;
  health: Health | null | undefined;
}) {
  if (!health) return null;
  const t = await getTranslations({ locale, namespace: 'CruisingHealth' });
  return (
    <>
      <h2 className={cruising.subTitle}>{t('profileTitle')}</h2>
      <ul className={styles.healthFacts}>
        {health.prepStatus ? (
          <li className={cruising.tag}>{t(`prepStatuses.${health.prepStatus}`)}</li>
        ) : null}
        {health.lastTestedMonth ? (
          <li className={cruising.tag}>
            {t('lastTestedValue', { month: formatMonth(health.lastTestedMonth, locale) })}
          </li>
        ) : null}
      </ul>
    </>
  );
}
