import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './Stat.module.css';

/** A row of compact counters (`Stat`), at most six to a row and two on phones. */
export function StatGrid({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** The list's accessible name, when the heading above doesn't give one. */
  label?: string;
  className?: string;
}) {
  return (
    <ul className={[styles.grid, className ?? ''].filter(Boolean).join(' ')} aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * A compact counter (architecture 6.6): the number at 28 px, its label in at most two lines and an
 * optional note under it. Zero is dimmed. With `href` the whole counter is the link.
 */
export function Stat({
  value,
  label,
  href,
  note,
  trend,
}: {
  value: ReactNode;
  label: ReactNode;
  href?: string | null;
  /** A line under the label (the week before). */
  note?: ReactNode;
  /** Colours the note: up green, down fuchsia dark. */
  trend?: 'up' | 'down' | 'same';
}) {
  const zero = value === 0 || value === '0';
  const className = [styles.stat, zero ? styles.zero : ''].filter(Boolean).join(' ');
  const noteClass = [styles.note, trend === 'up' || trend === 'down' ? styles[trend] : '']
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
      {note ? <span className={noteClass}>{note}</span> : null}
    </>
  );
  return (
    <li className={styles.item}>
      {href ? (
        <Link href={href} className={className}>
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}
