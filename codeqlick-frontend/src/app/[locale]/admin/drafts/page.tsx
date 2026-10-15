import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListDrafts } from '@/lib/api/projects';
import { formatDateTime } from '@/lib/format';

/** Every project's drafts waiting for review; each is reviewed on its project page. */
export default async function AdminDraftsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.projects' });
  const drafts = await adminListDrafts();

  return (
    <>
      <PageHeader title={t('draftsPageTitle')} lead={t('draftsLead')} />
      {drafts.length === 0 ? (
        <EmptyState title={t('draftsEmptyTitle')} body={t('draftsEmptyBody')} />
      ) : (
        <ul className={styles.files}>
          {drafts.map((draft) => (
            <li key={draft.id} className={styles.fileRow}>
              <div className={styles.fileInfo}>
                <Link
                  href={`/admin/projects/${draft.project.id}#drafts`}
                  className={styles.fileName}
                >
                  {draft.title}
                </Link>
                <span className={styles.muted}>
                  {draft.project.name} · {formatDateTime(draft.createdAt, locale)}
                </span>
              </div>
              {draft.version ? <Badge tone="brand">{draft.version}</Badge> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
