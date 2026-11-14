import { formatBytes, formatSizeChange } from '@/lib/cloud';
import styles from './DeploymentFiles.module.css';

/** A file of a deployment; `previousSize` when it changed against another deployment. */
export type FileRow = { path: string; size: number; previousSize?: number };

export type FileTableLabels = {
  path: string;
  size: string;
  /** Set both to show the size in the other deployment and the difference (changed files). */
  previousSize?: string;
  change?: string;
};

/** A table of files (path and size). Hook-free, so Server and Client Components can render it. */
export function FileTable({
  items,
  locale,
  caption,
  labels,
}: {
  items: readonly FileRow[];
  locale: string;
  /** Read by screen readers only. */
  caption: string;
  labels: FileTableLabels;
}) {
  const withPrevious = labels.previousSize !== undefined && labels.change !== undefined;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{labels.path}</th>
            {withPrevious ? (
              <th scope="col" className={styles.number}>
                {labels.previousSize}
              </th>
            ) : null}
            <th scope="col" className={styles.number}>
              {labels.size}
            </th>
            {withPrevious ? (
              <th scope="col" className={styles.number}>
                {labels.change}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.path}>
              <td className={styles.path}>{item.path}</td>
              {withPrevious ? (
                <td className={styles.number}>
                  {item.previousSize === undefined ? '' : formatBytes(item.previousSize, locale)}
                </td>
              ) : null}
              <td className={styles.number}>{formatBytes(item.size, locale)}</td>
              {withPrevious ? (
                <td className={styles.number}>
                  {item.previousSize === undefined
                    ? ''
                    : formatSizeChange(item.size, item.previousSize, locale)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
