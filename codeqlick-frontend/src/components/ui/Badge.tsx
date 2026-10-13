import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'brand' | 'ink' | 'success' | 'warning' | 'danger';

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={[styles.badge, styles[tone], className ?? ''].filter(Boolean).join(' ')}>{children}</span>;
}
