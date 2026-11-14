'use client';

import { useState } from 'react';
import { buttonClassName } from '@/components/ui/buttonStyles';
import type { CloudResponseStats, CloudResponseWindow } from '@/lib/api/cloud';
import styles from './ResponseStats.module.css';

const WINDOWS: readonly CloudResponseWindow[] = ['24h', '7d', '30d'];

/** Milliseconds as "480 ms", or seconds ("1.2 s") from one second up. */
export function formatMs(ms: number, locale: string): string {
  const tag = locale === 'es' ? 'es-ES' : 'en-GB';
  if (ms < 1000) return `${Math.round(ms).toLocaleString(tag)} ms`;
  return `${(ms / 1000).toLocaleString(tag, { maximumFractionDigits: 1 })} s`;
}

export type ResponseStatsLabels = {
  group: string;
  windows: Record<CloudResponseWindow, string>;
  median: string;
  p95: string;
  average: string;
  empty: string;
  /** "Based on N checks", ready per window. */
  basedOn: Record<CloudResponseWindow, string>;
};

/**
 * Median, 95th percentile and average of a monitor's response times, with a switch between the
 * three windows the API already sent (no new request). Defaults to the last 24 hours.
 */
export function ResponseStats({
  stats,
  labels,
  locale,
  initial = '24h',
}: {
  stats: Record<CloudResponseWindow, CloudResponseStats>;
  labels: ResponseStatsLabels;
  locale: string;
  initial?: CloudResponseWindow;
}) {
  const [active, setActive] = useState<CloudResponseWindow>(initial);
  const current = stats[active];
  const value = (ms: number | undefined) =>
    current && ms !== undefined ? formatMs(ms, locale) : '—';

  return (
    <div className={styles.root}>
      <div role="group" aria-label={labels.group} className={styles.switch}>
        {WINDOWS.map((range) => (
          <button
            key={range}
            type="button"
            aria-pressed={active === range}
            className={buttonClassName({
              variant: 'outline',
              size: 'sm',
              className: active === range ? styles.active : undefined,
            })}
            onClick={() => setActive(range)}
          >
            {labels.windows[range]}
          </button>
        ))}
      </div>
      <dl className={styles.tiles} aria-live="polite">
        <div className={styles.tile}>
          <dt>{labels.median}</dt>
          <dd>{value(current?.median)}</dd>
        </div>
        <div className={styles.tile}>
          <dt>{labels.p95}</dt>
          <dd>{value(current?.p95)}</dd>
        </div>
        <div className={styles.tile}>
          <dt>{labels.average}</dt>
          <dd>{value(current?.average)}</dd>
        </div>
      </dl>
      <p className={styles.note}>{current ? labels.basedOn[active] : labels.empty}</p>
    </div>
  );
}
