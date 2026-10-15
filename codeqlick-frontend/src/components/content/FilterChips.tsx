import { Link } from '@/i18n/navigation';
import styles from './TagLinks.module.css';

type Href = { pathname: '/work'; query: Record<string, string | undefined> };
type Chip = { key: string; label: string; count?: number; href: Href; active: boolean };

/** A row of filter links (chips) with an "all" link first; the active one is marked. */
export function FilterChips({
  label,
  all,
  chips,
}: {
  /** Accessible name of the row, e.g. "Services". */
  label: string;
  all: { label: string; href: Href; active: boolean };
  chips: Chip[];
}) {
  const chip = (active: boolean) => (active ? `${styles.chip} ${styles.active}` : styles.chip);
  return (
    <ul className={styles.list} aria-label={label}>
      {[{ key: '', label: all.label, href: all.href, active: all.active } as Chip, ...chips].map(
        (item) => (
          <li key={item.key || 'all'}>
            <Link
              href={item.href}
              className={chip(item.active)}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
              {item.count !== undefined ? <span className={styles.count}>{item.count}</span> : null}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}
