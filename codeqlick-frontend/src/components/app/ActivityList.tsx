import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { ActivityEntry } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import styles from './app.module.css';

const ADMIN_SECTIONS: Record<string, string> = {
  post: 'posts',
  portfolio: 'portfolio',
  project: 'projects',
  lead: 'leads',
  user: 'users',
};

/** Admin page of the thing an entry is about, while it can still exist. */
function targetHref(entry: ActivityEntry): string | undefined {
  if (entry.action.endsWith('.deleted')) return undefined;
  const { type, id } = entry.target;
  if (type === 'media') return '/admin/media';
  if (type === 'tag') return '/admin/tags';
  const section = ADMIN_SECTIONS[type];
  return section && id ? `/admin/${section}/${id}` : undefined;
}

/** "Ada published the post «Hello»", newest first, with what changed underneath. */
/** Lead statuses as they were called before the stages followed the sales process. */
const LEGACY_LEAD_STATUSES: Record<string, string> = {
  CONTACTED: 'TALKING',
  QUALIFIED: 'CALL',
  ARCHIVED: 'SPAM',
};

export async function ActivityList({
  entries,
  locale,
}: {
  entries: ActivityEntry[];
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.activity' });
  const tp = await getTranslations({ locale, namespace: 'Phases' });
  const tl = await getTranslations({ locale, namespace: 'LeadStatuses' });
  const tr = await getTranslations({ locale, namespace: 'Roles' });
  const ts = await getTranslations({ locale, namespace: 'PublishStatuses' });

  /** Short notes on what changed, in the reader's language. Unknown keys are skipped. */
  function detailNotes(entry: ActivityEntry): string[] {
    const details = entry.details ?? {};
    const notes: string[] = [];
    const text = (value: unknown) => (typeof value === 'string' ? value : String(value));
    if ('status' in details) {
      // Entries from before the lead stages were renamed carry the old names.
      const status = LEGACY_LEAD_STATUSES[text(details.status)] ?? text(details.status);
      notes.push(
        t('details.status', {
          value: entry.target.type === 'lead' ? tl(status as never) : ts(status as never),
        }),
      );
    }
    if ('project' in details) notes.push(t('details.project', { value: text(details.project) }));
    if ('phase' in details)
      notes.push(t('details.phase', { value: tp(text(details.phase) as never) }));
    if ('progress' in details)
      notes.push(t('details.progress', { value: Number(details.progress) }));
    if (typeof details.publishedAt === 'string') {
      notes.push(t('details.publishedAt', { value: formatDateTime(details.publishedAt, locale) }));
    }
    if ('file' in details) notes.push(t('details.file', { value: text(details.file) }));
    if ('milestone' in details) {
      notes.push(t('details.milestone', { value: text(details.milestone) }));
    }
    if ('title' in details) notes.push(t('details.title', { value: text(details.title) }));
    if ('name' in details) notes.push(t('details.name', { value: text(details.name) }));
    if ('role' in details)
      notes.push(t('details.role', { value: tr(text(details.role) as never) }));
    if ('isActive' in details)
      notes.push(details.isActive ? t('details.activated') : t('details.deactivated'));
    if (details.passwordReset) notes.push(t('details.passwordReset'));
    return notes;
  }

  return (
    <ul className={styles.files}>
      {entries.map((entry) => {
        const href = targetHref(entry);
        const label = entry.target.label ?? '';
        const target = (chunks: ReactNode) =>
          href ? (
            <Link href={href} className={styles.activityTarget}>
              {chunks}
            </Link>
          ) : (
            <span className={styles.activityTarget}>{chunks}</span>
          );
        // The API's action names match the message keys (`post.published` → actions.post.published).
        const key = `actions.${entry.action}` as Parameters<typeof t.rich>[0];
        const sentence = t.has(key)
          ? t.rich(key, { label, target, scope: String(entry.details?.scope ?? 'other') })
          : t('actions.unknown', { action: entry.action });
        const notes = detailNotes(entry);
        return (
          <li key={entry.id} className={styles.fileRow}>
            <div className={styles.fileInfo}>
              <span>
                <strong>{entry.actor.name}</strong> {sentence}
              </span>
              {notes.length > 0 ? <span className={styles.muted}>{notes.join(' · ')}</span> : null}
            </div>
            <time className={styles.muted} dateTime={entry.createdAt}>
              {formatDateTime(entry.createdAt, locale)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
