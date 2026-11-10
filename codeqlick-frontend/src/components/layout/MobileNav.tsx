'use client';

import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { LocaleSwitcher } from './LocaleSwitcher';
import { isActivePath } from './NavLinks';
import styles from './MobileNav.module.css';

type Item = {
  href: string;
  label: string;
  /** Already locale-prefixed (hash links). */ raw?: boolean;
};

/**
 * Menu button + panel shown below 720px. The text nav links are hidden at that width; below
 * 480px the header's call to action is too, and lives at the end of this panel.
 */
export function MobileNav({
  items,
  labels,
  cta,
}: {
  items: Item[];
  labels: { open: string; close: string; menu: string };
  /** Main call to action, shown as a full-width button at the end of the panel. */
  cta?: { href: string; label: string };
}) {
  const pathname = usePathname();
  // The panel is "open for a given path": navigating elsewhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? labels.close : labels.open}
        onClick={() => setOpen(!open)}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <div id="mobile-nav-panel" className={styles.panel} hidden={!open}>
        <ul className={styles.list} aria-label={labels.menu}>
          {items.map((item) => (
            <li key={item.href}>
              {item.raw ? (
                <NextLink href={item.href} className={styles.item} onClick={() => setOpen(false)}>
                  {item.label}
                </NextLink>
              ) : (
                <Link
                  href={item.href}
                  className={styles.item}
                  aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div className={styles.footer}>
          <LocaleSwitcher />
          {cta ? (
            <Link href={cta.href} className={buttonClassName({ size: 'sm' })}>
              {cta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
