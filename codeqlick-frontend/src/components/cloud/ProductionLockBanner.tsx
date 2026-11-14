import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import styles from './ProductionLockBanner.module.css';

/**
 * The project's "Production is locked" notice after a rollback (architecture 4.13), with its
 * actions (Unlock, for admins) below the message so the form's own messages aren't nested in it.
 */
export function ProductionLockBanner({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  /** Actions shown under the message, e.g. the Unlock form; omitted for members. */
  children?: ReactNode;
}) {
  return (
    <div className={styles.lock}>
      <Alert tone="warning">
        <strong>{title}</strong> {body}
      </Alert>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  );
}
