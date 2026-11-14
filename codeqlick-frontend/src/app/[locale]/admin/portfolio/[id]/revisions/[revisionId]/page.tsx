import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { RestoreRevisionForm, RevisionCompare } from '@/components/app/RevisionCompare';
import { SERVICES } from '@/components/content/services';
import { Alert } from '@/components/ui/Alert';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetPortfolioItem, adminGetPortfolioRevision } from '@/lib/api/portfolio';
import { formatDateTime } from '@/lib/format';
import { hasChanges, portfolioRevisionDiff } from '@/lib/revisions';
import { restorePortfolioRevisionAction } from '../../../actions';

/** An earlier version of a case study next to the current one, with "Restore this version". */
export default async function PortfolioRevisionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; revisionId: string }>;
}) {
  const { locale: rawLocale, id, revisionId } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.portfolio' });
  const tr = await getTranslations({ locale, namespace: 'Admin.revisions' });
  const th = await getTranslations({ locale, namespace: 'Home' });

  const loaded = await Promise.all([
    adminGetPortfolioItem(id),
    adminGetPortfolioRevision(id, revisionId),
  ]).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });
  const [item, revision] = loaded;

  const known = new Set<string>(SERVICES.map(({ key }) => key));
  const serviceName = (key: string) =>
    known.has(key) ? th(`services.items.${key}.title` as never) : key;
  const diff = portfolioRevisionDiff(revision.snapshot, item, serviceName);

  return (
    <div className={styles.stack}>
      <PageHeader
        title={tr('title', { date: formatDateTime(revision.createdAt, locale) })}
        lead={revision.author ? tr('replacedBy', { author: revision.author.name }) : undefined}
        back={{ href: `/admin/portfolio/${item.id}`, label: tr('back') }}
      />
      {hasChanges(diff) ? null : <Alert tone="info">{tr('noChanges')}</Alert>}
      <RevisionCompare locale={locale} diff={diff} fieldLabel={(field) => t(field as never)} />
      <RestoreRevisionForm
        locale={locale}
        action={restorePortfolioRevisionAction.bind(null, locale, item.id, revision.id)}
        body={tr('restoreBodyPortfolio')}
      />
    </div>
  );
}
