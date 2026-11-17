import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './PageHeader.module.css';

type PageHeaderProps = {
  /** The page's one H1, always outside cards. */
  title: ReactNode;
  eyebrow?: ReactNode;
  /** A live line between the eyebrow and the title (Videochat's "N online"). */
  status?: ReactNode;
  lead?: ReactNode;
  /** Badges, addresses or a status line under the title. */
  meta?: ReactNode;
  /** The page's buttons (`md`); beside the title from 48 rem. */
  actions?: ReactNode;
  /** "← label" above the title, to the page above. */
  back?: { href: string; label: ReactNode };
  /** `hero`: an app landing's marketing header (more room above). */
  variant?: 'page' | 'hero';
  titleId?: string;
  className?: string;
  /** What goes between the lead and the actions (an 18+ landing's warning). */
  children?: ReactNode;
};

/**
 * Every page's header (architecture 6.6): back link, eyebrow, the H1 at `--text-h1`, lead, meta
 * and actions, then 24 px (32 from 48 rem) before the content.
 */
export function PageHeader({
  title,
  eyebrow,
  status,
  lead,
  meta,
  actions,
  back,
  variant = 'page',
  titleId,
  className,
  children,
}: PageHeaderProps) {
  const classes = [styles.header, variant === 'hero' ? styles.hero : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <header className={classes}>
      <div className={styles.text}>
        {back ? (
          <Link href={back.href} className={styles.back}>
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        ) : null}
        {eyebrow ? <p className={`eyebrow ${styles.eyebrow}`}>{eyebrow}</p> : null}
        {status}
        <h1 id={titleId} className={styles.title}>
          {title}
        </h1>
        {meta ? <div className={styles.meta}>{meta}</div> : null}
        {lead ? <div className={styles.lead}>{lead}</div> : null}
        {children ? <div className={styles.extra}>{children}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
