import { getTranslations } from 'next-intl/server';
import vc from '@/app/[locale]/videochat/videochat.module.css';
import type { AppLocale } from '@/i18n/routing';
import { getCruisingSpotHours, type CruisingSpotHours } from '@/lib/api/cruising';
import { busiestHourOfDay, busiestHours, hourSpan, weekdayName } from '@/lib/cruising';
import styles from './Cruising.module.css';

/**
 * A spot's busiest hours (decision 89), for members who have entered: a bar per hour of each day
 * of the week in the spot's local time, the busiest marked. Only counters: nobody's check-in can be
 * read from it, and nothing shows before 10 check-ins were counted. The bars are for the eyes; the
 * same information is said in words for screen readers.
 */
export async function SpotHours({ locale, spotId }: { locale: AppLocale; spotId: string }) {
  const t = await getTranslations({ locale, namespace: 'Cruising.hours' });
  let hours: CruisingSpotHours | null = null;
  try {
    hours = await getCruisingSpotHours(spotId);
  } catch {
    // The page still works when the hours can't be read.
  }
  if (!hours) return null;

  const top = hours.ready ? busiestHours(hours.days, 3) : [];
  const busiest = top[0];
  return (
    <section className={styles.section} aria-labelledby="hours-title">
      <h2 id="hours-title" className={vc.sectionTitle}>
        {t('title')}
      </h2>
      {!hours.ready || !busiest ? (
        <p className={vc.muted}>{t('notReady')}</p>
      ) : (
        <>
          <p>
            {t('summary', {
              slots: top
                .map((slot) => `${weekdayName(slot.day, locale)} ${hourSpan(slot.hour)}`)
                .join(', '),
            })}
          </p>
          <div className={styles.hoursChart} aria-hidden="true">
            {hours.days.map((day, dayIndex) => (
              <div key={dayIndex} className={styles.hoursRow}>
                <span className={styles.hoursDay}>{weekdayName(dayIndex, locale, 'short')}</span>
                <span className={styles.hoursBars}>
                  {day.map((value, hour) => (
                    <span
                      key={hour}
                      className={[
                        styles.hoursBar,
                        value === 0 ? styles.hoursBarEmpty : '',
                        dayIndex === busiest.day && hour === busiest.hour ? styles.hoursBarTop : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ height: `${Math.max(value, value > 0 ? 6 : 2)}%` }}
                      title={`${weekdayName(dayIndex, locale)} ${hourSpan(hour)}`}
                    />
                  ))}
                </span>
              </div>
            ))}
            <div className={styles.hoursRow}>
              <span className={styles.hoursDay} />
              <span className={styles.hoursScale}>
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>24</span>
              </span>
            </div>
          </div>
          <ul className={styles.srOnly}>
            {hours.days.map((day, dayIndex) => {
              const hour = busiestHourOfDay(day);
              return (
                <li key={dayIndex}>
                  {hour === null
                    ? t('dayQuiet', { day: weekdayName(dayIndex, locale) })
                    : t('dayBusiest', { day: weekdayName(dayIndex, locale), time: hourSpan(hour) })}
                </li>
              );
            })}
          </ul>
          <p className={vc.muted}>{t('note')}</p>
        </>
      )}
    </section>
  );
}
