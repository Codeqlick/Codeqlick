import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { RestoreRevisionForm, RevisionCompare } from '@/components/app/RevisionCompare';
import { Alert } from '@/components/ui/Alert';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetPost, adminGetPostRevision, adminListTags } from '@/lib/api/posts';
import { formatDateTime } from '@/lib/format';
import { hasChanges, postRevisionDiff } from '@/lib/revisions';
import { restorePostRevisionAction } from '../../../actions';

/** An earlier version of a post next to the current one, with "Restore this version". */
export default async function PostRevisionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; revisionId: string }>;
}) {
  const { locale: rawLocale, id, revisionId } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.posts' });
  const tr = await getTranslations({ locale, namespace: 'Admin.revisions' });

  const loaded = await Promise.all([
    adminGetPost(id),
    adminGetPostRevision(id, revisionId),
    adminListTags(),
  ]).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });
  const [post, revision, tags] = loaded;

  const names = new Map(
    tags.map((tag) => [tag.id, locale === 'es' ? tag.nameEs : tag.nameEn] as const),
  );
  const diff = postRevisionDiff(
    revision.snapshot,
    post,
    (tagId) => names.get(tagId) ?? tr('deletedTag'),
  );

  return (
    <div className={styles.stack}>
      <PageHeader
        title={tr('title', { date: formatDateTime(revision.createdAt, locale) })}
        lead={revision.author ? tr('replacedBy', { author: revision.author.name }) : undefined}
        back={{ href: `/admin/posts/${post.id}`, label: tr('back') }}
      />
      {hasChanges(diff) ? null : <Alert tone="info">{tr('noChanges')}</Alert>}
      <RevisionCompare locale={locale} diff={diff} fieldLabel={(field) => t(field as never)} />
      {/* Restoring a version equal to the current one would change nothing. */}
      {hasChanges(diff) ? (
        <RestoreRevisionForm
          locale={locale}
          action={restorePostRevisionAction.bind(null, locale, post.id, revision.id)}
          body={tr('restoreBodyPost')}
        />
      ) : null}
    </div>
  );
}
