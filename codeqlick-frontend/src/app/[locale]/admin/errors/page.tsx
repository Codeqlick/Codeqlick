import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListErrors } from '@/lib/api/error-reports';
import { firstParam, formatDateTime } from '@/lib/format';
import { resolveAllErrorsAction } from './actions';
import { ErrorSourceBadge } from './ErrorSourceBadge';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The unexpected errors of the API and the website, grouped (architecture 4.11). */
export default async function AdminErrorsPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AdminErrors' });
  const status = firstParam((await searchParams).status) === 'resolved' ? 'resolved' : 'open';
  const errors = await adminListErrors(status);

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />

      <nav className={styles.filters} aria-label={t('tabsLabel')}>
        {(['open', 'resolved'] as const).map((tab) => (
          <Link
            key={tab}
            href={tab === 'open' ? '/admin/errors' : '/admin/errors?status=resolved'}
            className={buttonClassName({
              variant: tab === status ? 'primary' : 'outline',
              size: 'sm',
            })}
            aria-current={tab === status ? 'page' : undefined}
          >
            {t(`tabs.${tab}`)}
          </Link>
        ))}
      </nav>

      {errors.length === 0 ? (
        <EmptyState
          title={t(status === 'open' ? 'emptyTitle' : 'emptyResolvedTitle')}
          body={t(status === 'open' ? 'emptyBody' : 'emptyResolvedBody')}
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('error')}</th>
                  <th scope="col">{t('source')}</th>
                  <th scope="col">{t('count')}</th>
                  <th scope="col">{t('lastSeen')}</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error) => (
                  <tr key={error.id}>
                    <th scope="row">
                      <Link href={`/admin/errors/${error.id}`}>{error.message}</Link>
                      {error.path ? (
                        <span className={styles.sub}>
                          {[error.method, error.path].filter(Boolean).join(' ')}
                        </span>
                      ) : null}
                    </th>
                    <td>
                      <ErrorSourceBadge source={error.source} locale={locale} />
                    </td>
                    <td>{error.count}</td>
                    <td>{formatDateTime(error.lastSeenAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {status === 'open' ? (
            <ActionForm action={resolveAllErrorsAction.bind(null, locale)}>
              <SubmitButton variant="outline" size="sm">
                {t('resolveAll')}
              </SubmitButton>
            </ActionForm>
          ) : null}
        </>
      )}
    </div>
  );
}
