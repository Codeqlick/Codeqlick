import type { CloudDayUptime } from '@/lib/api/cloud';
import styles from './UptimeBars.module.css';

/** 90 days of uptime as bars (green, amber under 99 %, red under 95 %, grey without data). */
export function UptimeBars({
  days,
  locale,
  label,
}: {
  days: CloudDayUptime[];
  locale: string;
  /** The summary read out instead of every bar. */
  label: string;
}) {
  const format = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const percent = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    style: 'percent',
    maximumFractionDigits: 2,
  });
  return (
    <>
      <span className="visually-hidden">{label}</span>
      <div className={styles.bars} aria-hidden="true">
        {days.map((day) => {
          const tone =
            day.ratio === null
              ? styles.none
              : day.ratio >= 0.99
                ? styles.good
                : day.ratio >= 0.95
                  ? styles.warn
                  : styles.bad;
          return (
            <span
              key={day.day}
              className={`${styles.bar} ${tone}`}
              title={`${format.format(new Date(`${day.day}T12:00:00Z`))}: ${day.ratio === null ? '—' : percent.format(day.ratio)}`}
            />
          );
        })}
      </div>
    </>
  );
}

/** "99.95 %", or "—" without data. */
export function formatUptime(ratio: number | null, locale: string): string {
  if (ratio === null) return '—';
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(ratio);
}
