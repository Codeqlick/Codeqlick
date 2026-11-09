import styles from './VerifiedBadge.module.css';

/**
 * The "verified" tick next to a nickname in the web apps: the team approved the person's
 * verification photo. `label` is the accessible text and the tooltip.
 */
export function VerifiedBadge({ label }: { label: string }) {
  return (
    <span className={styles.badge} title={label}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="8" fill="currentColor" />
        <path
          d="M4.5 8.2 7 10.6l4.6-5"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.label}>{label}</span>
    </span>
  );
}
