import styles from './WeekStats.module.css';

export type WeekStat = {
  label: string;
  /** The last 7 days. */
  value: number;
  /** The 7 days before, to compare. */
  previous: number;
};

/** "Your week" in the web apps: a few figures, each with its change against the week before. */
export function WeekStats({
  title,
  lead,
  items,
  locale,
  previousLabel,
}: {
  title: string;
  lead?: string;
  items: WeekStat[];
  locale: string;
  /** "{count} the week before", already translated for each item's previous value. */
  previousLabel: (previous: number) => string;
}) {
  const number = new Intl.NumberFormat(locale);
  return (
    <section className={styles.stats} aria-labelledby="week-stats-title">
      <h2 id="week-stats-title" className={styles.title}>
        {title}
      </h2>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      <dl className={styles.grid}>
        {items.map((item) => {
          const trend =
            item.value > item.previous ? 'up' : item.value < item.previous ? 'down' : 'same';
          return (
            <div key={item.label} className={styles.item}>
              <dt className={styles.label}>{item.label}</dt>
              <dd className={styles.value}>{number.format(item.value)}</dd>
              <dd className={`${styles.previous} ${styles[trend]}`}>
                <span aria-hidden="true">
                  {trend === 'up' ? '▲ ' : trend === 'down' ? '▼ ' : ''}
                </span>
                {previousLabel(item.previous)}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
