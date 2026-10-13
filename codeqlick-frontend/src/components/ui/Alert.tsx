import type { ReactNode } from 'react';
import styles from './Alert.module.css';

/** Inline status message. Errors use role="alert", others role="status" (polite). */
export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
