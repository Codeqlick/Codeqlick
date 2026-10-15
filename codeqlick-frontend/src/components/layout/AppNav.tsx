'use client';

import { Link, usePathname } from '@/i18n/navigation';
import styles from './AppShell.module.css';

export type AppNavItem = {
  /** Locale-less href, e.g. `/admin/leads`. */
  href: string;
  label: string;
  /** Only highlight on an exact match (dashboards / section roots). */
  exact?: boolean;
};

export function AppNav({ items, label }: { items: AppNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label={label}>
      <ul className={styles.list}>
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={[styles.navLink, active ? styles.active : ''].filter(Boolean).join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
