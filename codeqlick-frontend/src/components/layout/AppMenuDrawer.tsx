'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { isCurrentPath } from '@/lib/app-menus';
import type { Webapp } from '@/lib/webapps';
import styles from './AppMenu.module.css';

type AppMenuDrawerProps = {
  /** The ☰ button's accessible name ("Menu", or "Menu — <name>" when signed in). */
  openLabel: string;
  /** The close button's accessible name ("Close menu"). */
  closeLabel: string;
  /** The panel's visible title, which also names the dialog. */
  title: string;
  /** The signed-in person's small avatar, shown in the ☰ button (decorative: the name is in its label). */
  avatar?: ReactNode;
  /** The panel's contents, rendered on the server. */
  children: ReactNode;
};

/**
 * The ☰ button and the menu drawer (decision 107): a native modal `<dialog>`, so the browser traps
 * the focus, makes the page inert and closes it on Escape. A click on the backdrop, the close
 * button, a followed link or any navigation close it too; the focus goes back to the ☰ button.
 */
export function AppMenuDrawer({
  openLabel,
  closeLabel,
  title,
  avatar,
  children,
}: AppMenuDrawerProps) {
  const dialogId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, []);

  const show = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setOpen(true);
    // The page behind stays where it is while the menu is open.
    document.documentElement.dataset.appMenuOpen = '';
    closeRef.current?.focus();
  };

  // Every way the dialog closes (Escape, the close button, a link, a navigation) ends here.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      setOpen(false);
      delete document.documentElement.dataset.appMenuOpen;
      triggerRef.current?.focus();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      // The dialog itself is only hit outside the panel, on the backdrop.
      if (target === dialog || target?.closest('a')) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    dialog.addEventListener('close', onClose);
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('close', onClose);
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('keydown', onKeyDown);
      delete document.documentElement.dataset.appMenuOpen;
    };
  }, [close]);

  // A navigation (the back button, a redirect) closes the menu.
  useEffect(() => {
    close();
  }, [pathname, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={avatar ? `${styles.trigger} ${styles.triggerUser}` : styles.trigger}
        aria-label={openLabel}
        aria-expanded={open}
        aria-controls={dialogId}
        aria-haspopup="dialog"
        onClick={show}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path
            d="M4 7h16M4 12h16M4 17h16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {avatar ? (
          <span className={styles.triggerAvatar} aria-hidden="true">
            {avatar}
          </span>
        ) : null}
      </button>
      <dialog
        ref={dialogRef}
        id={dialogId}
        className={styles.drawer}
        aria-labelledby={titleId}
        aria-modal="true"
      >
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <p id={titleId} className={styles.title}>
              {title}
            </p>
            <button
              ref={closeRef}
              type="button"
              className={styles.close}
              aria-label={closeLabel}
              onClick={close}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** A link of the menu, marked as the current page when it is (`aria-current="page"`). */
export function AppMenuLink({
  href,
  app,
  className,
  children,
}: {
  href: string;
  app: Webapp;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = isCurrentPath(pathname, href, app);
  return (
    <Link href={href} className={className} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  );
}
