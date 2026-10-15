import { Link } from '@/i18n/navigation';
import type { PublicTag } from '@/lib/api/types';
import styles from './TagLinks.module.css';

/** Tags as links to the blog filtered by each; `active` marks the one being shown. */
export function TagLinks({
  tags,
  active,
  label,
  all,
}: {
  tags: (PublicTag & { count?: number })[];
  active?: string;
  /** Accessible name of the list, e.g. "Topics". */
  label: string;
  /** Adds a first link to the unfiltered blog with this text. */
  all?: string;
}) {
  if (tags.length === 0) return null;
  const chip = (isActive: boolean) => (isActive ? `${styles.chip} ${styles.active}` : styles.chip);

  return (
    <ul className={styles.list} aria-label={label}>
      {all ? (
        <li>
          <Link href="/blog" className={chip(!active)} aria-current={!active ? 'page' : undefined}>
            {all}
          </Link>
        </li>
      ) : null}
      {tags.map((tag) => (
        <li key={tag.slug}>
          <Link
            href={{ pathname: '/blog', query: { tag: tag.slug } }}
            className={chip(tag.slug === active)}
            aria-current={tag.slug === active ? 'page' : undefined}
          >
            {tag.name}
            {tag.count !== undefined ? <span className={styles.count}>{tag.count}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
