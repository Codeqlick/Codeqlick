import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './Tabs.module.css';

export type TabsVariant = 'segmented' | 'pills';

export type TabItem = {
  href: ComponentProps<typeof Link>['href'];
  label: ReactNode;
  current?: boolean;
  /** React key, when the href is an object or not unique. */
  key?: string;
};

export function tabsClassName(variant: TabsVariant, className?: string): string {
  return [styles.tabs, styles[variant], className ?? ''].filter(Boolean).join(' ');
}

export const tabClassName = styles.tab;

/**
 * Links between the views of a page (`segmented`) or the filters of a list (`pills`), each to its
 * own address (architecture 6.6). They stay links: Tab moves between them and the current one is
 * `aria-current="page"`. Views switched in place use `TabList`.
 */
export function Tabs({
  label,
  items,
  variant = 'segmented',
  className,
}: {
  /** The navigation's accessible name. */
  label: string;
  items: TabItem[];
  variant?: TabsVariant;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className={tabsClassName(variant)}>
        {items.map((item, index) => (
          <li key={item.key ?? (typeof item.href === 'string' ? item.href : index)}>
            <Link
              href={item.href}
              className={styles.tab}
              aria-current={item.current ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
