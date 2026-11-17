import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './FilterBar.module.css';

/**
 * A list's filters (architecture 6.6): a GET form in a `<search>` landmark whose fields and buttons are 44 px high,
 * bottom-aligned and wrapping on phones. `actions` (the submit button, `md` outline) go last.
 */
export function FilterBar({
  label,
  actions,
  children,
  className,
  method = 'get',
  ...rest
}: {
  /** The search landmark's accessible name. */
  label?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<'form'>, 'children' | 'className'>) {
  return (
    <search aria-label={label}>
      <form
        method={method}
        className={[styles.bar, className ?? ''].filter(Boolean).join(' ')}
        {...rest}
      >
        {children}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </form>
    </search>
  );
}
