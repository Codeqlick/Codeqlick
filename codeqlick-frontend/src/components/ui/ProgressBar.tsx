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
      <progress
        className={styles.track}
        value={clamped}
        max={100}
        aria-label={ariaLabel}
        aria-valuetext={label}
      />
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}
