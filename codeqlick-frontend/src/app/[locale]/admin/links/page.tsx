import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListLinks } from '@/lib/api/links';
import { firstParam, formatDate, formatDateTime } from '@/lib/format';
import {
  displayLinkUrl,
  isHttpUrl,
  linkResultLabel,
  linkSourceEditHref,
  parseLinkFilter,
} from '@/lib/links';
import { checkLinkAction } from './actions';
import linkStyles from './links.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The links of published posts and case studies, checked weekly (architecture 4.6). */
export default async function AdminLinksPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AdminLinks' });
  const filter = parseLinkFilter(firstParam((await searchParams).status));
  const { items, lastRunAt } = await adminListLinks(filter);
  const lastRun = lastRunAt
    ? t('lastRun', { date: formatDateTime(lastRunAt, locale) })
    : t('notCheckedYet');

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('lead')} />

      <nav className={styles.filters} aria-label={t('filtersLabel')}>
        {(['broken', 'all'] as const).map((tab) => (
          <Link
            key={tab}
            href={tab === 'broken' ? '/admin/links' : '/admin/links?status=all'}
            className={buttonClassName({
              variant: tab === filter ? 'primary' : 'outline',
              size: 'sm',
            })}
            aria-current={tab === filter ? 'page' : undefined}
          >
            {t(`filters.${tab}`)}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          title={t(filter === 'broken' ? 'emptyTitle' : 'emptyAllTitle')}
          body={lastRun}
        />
      ) : (
        <>
          <p className={styles.sub}>{lastRun}</p>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.listTable}`}>
              <thead>
                <tr>
                  <th scope="col">{t('where')}</th>
                  <th scope="col">{t('link')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('since')}</th>
                  <th scope="col">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((link) => {
                  const result = linkResultLabel(link);
                  return (
                    <tr key={link.id}>
                      <th scope="row">
                        <Link href={linkSourceEditHref(link.source)}>
                          {link.source.title}
                          <span className="visually-hidden"> — {t('edit')}</span>
                        </Link>
                        <span className={styles.sub}>
                          {t(`sources.${link.source.type}`)} ·{' '}
                          {t(`languages.${link.source.locale}`)}
                        </span>
                      </th>
                      <td data-label={t('link')} data-wide>
                        {isHttpUrl(link.url) ? (
                          <a
                            href={link.url}
                            target="_blank"
                            rel={link.internal ? undefined : 'noopener noreferrer'}
                            title={link.url}
                            className={linkStyles.url}
                          >
                            {displayLinkUrl(link.url)}
                            <span className="visually-hidden"> {t('newTab')}</span>
                          </a>
                        ) : (
                          <span title={link.url} className={linkStyles.url}>
                            {link.url}
                          </span>
                        )}
                        <span className={styles.sub}>
                          {t(link.internal ? 'internal' : 'external')}
                        </span>
                      </td>
                      <td data-label={t('status')}>
                        <Badge tone={link.status === 'BROKEN' ? 'danger' : 'success'}>
                          {t(`statuses.${link.status}`)}
                        </Badge>
                        {result ? (
                          <span className={`${styles.sub} ${linkStyles.result}`}>{result}</span>
                        ) : null}
                      </td>
                      <td data-label={t('since')}>
                        {link.brokenSince ? formatDate(link.brokenSince, locale) : '—'}
                        <span className={styles.sub}>
                          {t('checkedAt', { date: formatDateTime(link.checkedAt, locale) })}
                        </span>
                      </td>
                      <td data-label={t('actions')}>
                        <ActionForm
                          action={checkLinkAction.bind(null, locale, link.id)}
                          className={linkStyles.rowAction}
                        >
                          <SubmitButton variant="outline" size="sm" pendingLabel={t('checking')}>
                            {t('checkAgain')}
                          </SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
