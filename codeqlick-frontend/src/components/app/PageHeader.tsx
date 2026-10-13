import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './app.module.css';

/** Title row for portal and admin pages, with an optional back link and actions on the right. */
export function PageHeader({
  title,
  lead,
  back,
  actions,
}: {
  title: string;
  lead?: string;
  /** Locale-less href, e.g. `/admin/posts`. */
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div>
        {back ? (
          <Link href={back.href} className={styles.back}>
            ← {back.label}
          </Link>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        {lead ? <p className={styles.lead}>{lead}</p> : null}
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </div>
  );
}
