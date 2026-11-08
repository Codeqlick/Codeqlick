import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { TodoItem, TodoKind } from '@/lib/api/projects';
import { formatDate } from '@/lib/format';
import styles from './PortalTodo.module.css';

/** Where each thing is done. */
function hrefOf(item: TodoItem): string {
  switch (item.kind) {
    case 'approval':
      return `/portal/projects/${item.projectId}#update-${item.id}`;
    case 'proposal':
      return `/portal/proposals/${item.id}`;
    case 'ticket':
      return `/portal/support/${item.id}`;
    case 'brief':
      return `/portal/projects/${item.id}/brief`;
    case 'review':
      return `/portal/projects/${item.id}/review`;
    case 'invoice':
      return '/portal/invoices';
  }
}

const ICON: Record<TodoKind, string> = {
  approval: '✓',
  proposal: '€',
  ticket: '?',
  brief: '✎',
  review: '★',
  invoice: '€',
};

/**
 * "Waiting on you": what the client has to do, each with a link to where it is done. Nothing is
 * shown when nothing waits. `showProject` names the project (the portal home lists them all).
 */
export async function PortalTodo({
  items,
  locale,
  showProject = true,
}: {
  items: TodoItem[];
  locale: AppLocale;
  showProject?: boolean;
}) {
  if (items.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'PortalTodo' });
  return (
    <section className={styles.todo} aria-labelledby="portal-todo-heading">
      <h2 id="portal-todo-heading" className={styles.title}>
        {t('title', { count: items.length })}
      </h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`} className={styles.item}>
            <span className={styles.icon} aria-hidden="true">
              {ICON[item.kind]}
            </span>
            <span className={styles.text}>
              <Link href={hrefOf(item)} className={styles.link}>
                {t(`kinds.${item.kind}`, { title: item.title })}
              </Link>
              <span className={styles.meta}>
                {showProject && item.projectName && item.kind !== 'brief' && item.kind !== 'review'
                  ? `${item.projectName} · `
                  : ''}
                {t('since', { date: formatDate(item.since, locale) })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
