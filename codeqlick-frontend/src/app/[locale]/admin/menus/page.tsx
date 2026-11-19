import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { ActionForm, FormInput, FormTextarea } from '@/components/app/ActionForm';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Tabs } from '@/components/ui/Tabs';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { resolveLocale } from '@/i18n/locale';
import { adminListMenuReports, adminListMenus, type MenuReportStatus } from '@/lib/api/menus';
import { firstParam, formatDateTime, parsePage } from '@/lib/format';
import { webappUrl } from '@/lib/webapp-seo';
import { closeReportAction, suspendMenuAction, unsuspendMenuAction } from './actions';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Menu's moderation (architecture 4.20): every menu, and the abuse reports people sent. */
export default async function AdminMenusPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.menus' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tr = await getTranslations({ locale, namespace: 'Menu.report' });

  const query = await searchParams;
  const tab = firstParam(query.tab) === 'reports' ? 'reports' : 'menus';
  const page = parsePage(query.page);
  const q = firstParam(query.q)?.trim() || undefined;
  const suspended = firstParam(query.suspended) === 'yes' ? true : undefined;
  const status: MenuReportStatus = firstParam(query.status) === 'CLOSED' ? 'CLOSED' : 'OPEN';

  const tabs = (
    <Tabs
      label={t('tabsLabel')}
      variant="pills"
      items={[
        { key: 'menus', href: '/admin/menus', label: t('tabMenus'), current: tab === 'menus' },
        {
          key: 'reports',
          href: '/admin/menus?tab=reports',
          label: t('tabReports'),
          current: tab === 'reports',
        },
      ]}
    />
  );

  if (tab === 'reports') {
    const reports = await adminListMenuReports({ status, page });
    return (
      <>
        <PageHeader title={t('title')} />
        {tabs}
        <FilterBar>
          <input type="hidden" name="tab" value="reports" />
          <Select
            name="status"
            label={t('status')}
            options={[
              { value: 'OPEN', label: t('statusOPEN') },
              { value: 'CLOSED', label: t('statusCLOSED') },
            ]}
            defaultValue={status}
          />
          <button type="submit" className={buttonClassName({ variant: 'outline' })}>
            {tc('filter')}
          </button>
        </FilterBar>
        {reports.items.length === 0 ? (
          <EmptyState title={t('noReports')} />
        ) : (
          <>
            <ul className={styles.cards}>
              {reports.items.map((report) => (
                <li key={report.id} className={styles.panel}>
                  <h2 className={styles.panelTitle}>
                    {report.businessName} <span className={styles.sub}>/{report.slug}</span>
                  </h2>
                  <p>
                    <Badge tone="warning">{tr(`reasons.${report.reason}`)}</Badge>{' '}
                    {formatDateTime(report.createdAt, locale)}
                    {report.email ? ` · ${report.email}` : ''}
                  </p>
                  <p>{report.details}</p>
                  {report.menu ? (
                    <p>
                      <a href={webappUrl('menu', locale, `/${report.menu.slug}`)}>
                        {t('openPage')}
                      </a>
                      {report.menu.suspended ? ` · ${t('alreadySuspended')}` : ''}
                    </p>
                  ) : (
                    <p className={styles.muted}>{t('menuGone')}</p>
                  )}
                  {report.status === 'CLOSED' ? (
                    <p className={styles.muted}>
                      {t('closedOn', { date: formatDateTime(report.closedAt, locale) })}
                      {report.note ? ` · ${report.note}` : ''}
                    </p>
                  ) : (
                    <ActionForm
                      action={closeReportAction.bind(null, locale, report.id)}
                      className={styles.form}
                    >
                      <FormInput
                        id={`note-${report.id}`}
                        name="note"
                        label={t('note')}
                        optionalLabel={t('optional')}
                        maxLength={500}
                      />
                      <div className={styles.actions}>
                        <SubmitButton variant="outline" size="sm">
                          {t('close')}
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            <Pagination
              page={reports.page}
              totalPages={reports.totalPages}
              pathname="/admin/menus"
              query={{ tab: 'reports', status: status === 'OPEN' ? undefined : status }}
            />
          </>
        )}
      </>
    );
  }

  const menus = await adminListMenus({ q, suspended, page });
  return (
    <>
      <PageHeader title={t('title')} />
      {tabs}
      <FilterBar>
        <Input
          name="q"
          type="search"
          label={t('search')}
          placeholder={t('searchPlaceholder')}
          defaultValue={q}
        />
        <Select
          name="suspended"
          label={t('suspendedFilter')}
          placeholder={tc('all')}
          options={[{ value: 'yes', label: t('onlySuspended') }]}
          defaultValue={suspended ? 'yes' : ''}
        />
        <button type="submit" className={buttonClassName({ variant: 'outline' })}>
          {tc('filter')}
        </button>
      </FilterBar>
      {menus.items.length === 0 ? (
        <EmptyState title={t('noMenus')} />
      ) : (
        <>
          <ul className={styles.cards}>
            {menus.items.map((menu) => (
              <li key={menu.id} className={styles.panel}>
                <h2 className={styles.panelTitle}>
                  <a href={webappUrl('menu', locale, `/${menu.slug}`)}>{menu.businessName}</a>{' '}
                  <span className={styles.sub}>/{menu.slug}</span>
                </h2>
                <p>
                  <Badge tone={menu.suspendedAt ? 'danger' : menu.enabled ? 'success' : 'neutral'}>
                    {menu.suspendedAt
                      ? t('stateSuspended')
                      : menu.enabled
                        ? t('stateOnline')
                        : t('statePaused')}
                  </Badge>{' '}
                  {t(`kind.${menu.kind}`)} · {menu.owner.name} ({menu.owner.email}) ·{' '}
                  {t('reports', { count: menu.reports })} · {formatDateTime(menu.updatedAt, locale)}
                </p>
                {menu.suspendedAt ? (
                  <ActionForm
                    action={unsuspendMenuAction.bind(null, locale, menu.id, menu.slug)}
                    className={styles.form}
                  >
                    <div className={styles.actions}>
                      <SubmitButton variant="outline" size="sm">
                        {t('unsuspend')}
                      </SubmitButton>
                    </div>
                  </ActionForm>
                ) : (
                  <details>
                    <summary>{t('suspend')}</summary>
                    <ActionForm
                      action={suspendMenuAction.bind(null, locale, menu.id, menu.slug)}
                      className={styles.form}
                    >
                      <FormTextarea
                        id={`reason-${menu.id}`}
                        name="reason"
                        label={t('reason')}
                        hint={t('reasonHint')}
                        required
                        rows={3}
                        maxLength={500}
                      />
                      <div className={styles.actions}>
                        <SubmitButton variant="danger" size="sm">
                          {t('suspendConfirm')}
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <Pagination
            page={menus.page}
            totalPages={menus.totalPages}
            pathname="/admin/menus"
            query={{ q, suspended: suspended ? 'yes' : undefined }}
          />
        </>
      )}
    </>
  );
}
