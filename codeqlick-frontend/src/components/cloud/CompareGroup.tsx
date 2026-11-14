import { FileTable, type FileRow, type FileTableLabels } from './FileTable';
import styles from './DeploymentFiles.module.css';

/**
 * One group of a comparison (added, removed or changed): a `<details>` open when it has files and
 * collapsed when empty. `items` may be the first rows only; `count` is the whole group's size and
 * `more` says how many were left out.
 */
export function CompareGroup({
  title,
  help,
  count,
  items,
  locale,
  labels,
  empty,
  more,
}: {
  title: string;
  help: string;
  count: number;
  items: readonly FileRow[];
  locale: string;
  labels: FileTableLabels;
  /** Shown instead of the table when the group is empty. */
  empty: string;
  more?: string;
}) {
  return (
    <details className={styles.group} open={count > 0}>
      <summary>
        <span>{title}</span>
        <span className={styles.count}>
          {count.toLocaleString(locale === 'es' ? 'es-ES' : 'en-GB')}
        </span>
      </summary>
      <div className={styles.groupBody}>
        <p className={styles.status}>{help}</p>
        {count === 0 ? (
          <p className={styles.status}>{empty}</p>
        ) : (
          <FileTable items={items} locale={locale} caption={title} labels={labels} />
        )}
        {more ? <p className={styles.status}>{more}</p> : null}
      </div>
    </details>
  );
}
