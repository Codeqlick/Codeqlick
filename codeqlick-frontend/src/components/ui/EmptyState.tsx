import type { ReactNode } from 'react';
import { BrandSymbol } from '@/components/brand/Symbol';
import styles from './EmptyState.module.css';

/**
 * An empty list or page (architecture 6.6): an icon (the brand symbol unless another or `null` is
 * given), a title, a line of text and at most one action, an `md` button.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  headingLevel = 2,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  /** `null` leaves the icon out. */
  icon?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const shown = icon === undefined ? <BrandSymbol size={40} /> : icon;
  return (
    <div className={styles.empty}>
      {shown ? (
        <span className={styles.icon} aria-hidden="true">
          {shown}
        </span>
      ) : null}
      <Heading className={styles.title}>{title}</Heading>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
