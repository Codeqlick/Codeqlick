import styles from './CruisingMedia.module.css';

type VerifiedBadgeProps = {
  /** "Verified" / "Verificado". */
  label: string;
  /** What the badge means (never claims an ID check); the tooltip and the screen reader's text. */
  help: string;
};

/** A fuchsia tick and the word, next to a verified member's nickname. */
export function VerifiedBadge({ label, help }: VerifiedBadgeProps) {
  return (
    <span className={styles.badge} title={help}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 0l2.1 1.5 2.6-.1.9 2.4 2.1 1.6-.8 2.5.8 2.5-2.1 1.6-.9 2.4-2.6-.1L8 16l-2.1-1.5-2.6.1-.9-2.4L.3 10.6l.8-2.6-.8-2.5 2.1-1.6.9-2.4 2.6.1L8 0zm-1 10.6l4.6-4.6-1-1L7 8.6 5.4 7l-1 1L7 10.6z" />
      </svg>
      <span>{label}</span>
      <span className={styles.srOnly}>. {help}</span>
    </span>
  );
}
