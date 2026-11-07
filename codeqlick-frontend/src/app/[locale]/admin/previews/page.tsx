import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListPreviews } from '@/lib/api/leads';
import { formatDateTime } from '@/lib/format';

const TONES = {
  BUILDING: 'warning',
  READY: 'success',
  FAILED: 'danger',
  REMOVED: 'neutral',
} as const;

/** Every preview of a website request or prospect, newest first (architecture 8.2). */
export default async function AdminPreviewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.previews' });
  const tlead = await getTranslations({ locale, namespace: 'Admin.leads' });
  const tw = await getTranslations({ locale, namespace: 'BasicWebsite' });
  const tk = (key: string) => tw(key as never);
  const previews = await adminListPreviews();

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Button href="/admin/previews/new" size="sm">
            {t('new')}
          </Button>
        }
      />
      {previews.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('business')}</th>
                <th scope="col">{t('style')}</th>
                <th scope="col">{t('status')}</th>
                <th scope="col">{t('origin')}</th>
                <th scope="col">{t('created')}</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((preview) => (
                <tr key={preview.leadId}>
                  <th scope="row">
                    <Link href={`/admin/leads/${preview.leadId}`}>
                      {preview.business ?? preview.name}
                    </Link>
                    {preview.status === 'READY' ? (
                      <span className={styles.sub}>
                        <a href={preview.url} target="_blank" rel="noopener noreferrer">
                          {preview.url.replace('https://', '')}
                        </a>
                      </span>
                    ) : null}
                  </th>
                  <td>{preview.preset ? tk(`demos.${preview.preset}.kind`) : '—'}</td>
                  <td>
                    {preview.purchased ? (
                      <Badge tone="success">{t('purchased')}</Badge>
                    ) : preview.status ? (
                      <Badge tone={TONES[preview.status]}>
                        {tlead(`previewStatuses.${preview.status}`)}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {preview.prospect ? t('prospect') : t('fromRequest')}
                    <span className={styles.sub}>{preview.email ?? t('noEmail')}</span>
                  </td>
                  <td>{formatDateTime(preview.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
