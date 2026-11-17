import type { ReactNode } from 'react';
import styles from './AppFrame.module.css';

/**
 * Every web app's layout (architecture 6.6): its `AppHeader`, the page at `--wrap` and its
 * `AppFooter` at the bottom of short pages.
 */
export function AppFrame({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      {header}
      <main className={styles.main}>{children}</main>
      {footer}
    </div>
  );
}
