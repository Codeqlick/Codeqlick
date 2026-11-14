import type { OutlineEntry } from '@/lib/markdown-outline';
import styles from './TableOfContents.module.css';

/** Texts with fewer `##` headings show no table of contents (architecture 6.2). */
export const TOC_MIN_SECTIONS = 3;

/**
 * "Contents" before a post or case study: one item per `##` with its `###` nested, linking to the
 * ids `Markdown` with `anchors` renders (both come from `getOutline`). Rendered on the server.
 */
export function TableOfContents({ outline, title }: { outline: OutlineEntry[]; title: string }) {
  if (outline.length < TOC_MIN_SECTIONS) return null;
  return (
    <nav className={styles.toc} aria-label={title}>
      <p className={styles.title}>{title}</p>
      <ol className={styles.list}>
        {outline.map((entry) => (
          <li key={entry.id}>
            <a href={`#${entry.id}`}>{entry.text}</a>
            {entry.children.length > 0 ? (
              <ol className={styles.sublist}>
                {entry.children.map((child) => (
                  <li key={child.id}>
                    <a href={`#${child.id}`}>{child.text}</a>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
