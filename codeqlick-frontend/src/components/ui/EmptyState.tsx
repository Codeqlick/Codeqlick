import type { ReactNode } from 'react';
import { BrandSymbol } from '@/components/brand/Symbol';
import styles from './EmptyState.module.css';

export function EmptyState({
  title,
  body,
  action,
  headingLevel = 2,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={styles.empty}>
      <BrandSymbol size={40} />
      <Heading className={styles.title}>{title}</Heading>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
