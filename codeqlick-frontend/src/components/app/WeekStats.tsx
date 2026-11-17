import { Stat, StatGrid } from '@/components/ui/Stat';
import styles from './WeekStats.module.css';

export type WeekStat = {
  label: string;
  /** The last 7 days. */
  value: number;
  /** The 7 days before, to compare. */
  previous: number;
};

/**
 * "Your week" in the web apps: a few figures as compact counters (`Stat`), each with its change
 * against the week before.
 */
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
      <StatGrid>
        {items.map((item) => {
          const trend =
            item.value > item.previous ? 'up' : item.value < item.previous ? 'down' : 'same';
          return (
            <Stat
              key={item.label}
              value={item.value === 0 ? 0 : number.format(item.value)}
              label={item.label}
              trend={trend}
              note={
                <>
                  <span aria-hidden="true">
                    {trend === 'up' ? '▲ ' : trend === 'down' ? '▼ ' : ''}
                  </span>
                  {previousLabel(item.previous)}
                </>
              }
            />
          );
        })}
      </StatGrid>
    </section>
  );
}
