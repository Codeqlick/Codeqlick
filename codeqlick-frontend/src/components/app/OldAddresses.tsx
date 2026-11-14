import { contentPath, type ContentSection } from '@/lib/slug-redirect';
import styles from './app.module.css';
import own from './OldAddresses.module.css';

/**
 * Read-only list of a post's or case study's old addresses, which redirect to its current one
 * (decision 71). Renders nothing when there are none.
 */
export function OldAddresses({
  locale,
  section,
  slugs,
  title,
  hint,
}: {
  locale: string;
  section: ContentSection;
  slugs: readonly string[] | undefined;
  title: string;
  hint: string;
}) {
  if (!slugs || slugs.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="old-addresses-heading">
      <h2 id="old-addresses-heading" className={styles.panelTitle}>
        {title}
      </h2>
      <p className={styles.muted}>{hint}</p>
      <ul className={own.list}>
        {slugs.map((slug) => (
          <li key={slug}>
            <code className={own.path}>{contentPath(locale, section, slug)}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
