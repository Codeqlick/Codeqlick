import styles from './ProgressBar.module.css';

/** Accessible progress bar (0–100). `label` is the visible text, e.g. "40% complete". */
export function ProgressBar({
  value,
  label,
  ariaLabel,
}: {
  value: number;
  label?: string;
  ariaLabel: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={styles.wrapper}>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={label}
      >
        <div className={styles.bar} style={{ width: `${clamped}%` }} />
      </div>
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}
