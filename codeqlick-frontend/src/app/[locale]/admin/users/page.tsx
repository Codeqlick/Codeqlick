import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { AccountKindBadge } from '@/components/app/AccountKindBadge';
import { PageHeader } from '@/components/app/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { ACCOUNT_KINDS, type AccountKind } from '@/lib/api/types';
import { adminListUsers } from '@/lib/api/users';
import { firstParam, formatDate, parsePage } from '@/lib/format';
import { WEBAPPS, type Webapp } from '@/lib/webapps';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The tabs of the list: everyone, each kind of account (decision 29), and the team. */
const TABS = ['all', ...ACCOUNT_KINDS, 'admin'] as const;
type Tab = (typeof TABS)[number];

export default async function AdminUsersPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  const tk = await getTranslations({ locale, namespace: 'Admin.users.kinds' });
  const ta = await getTranslations({ locale, namespace: 'Apps' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const query = await searchParams;
  const rawTab = firstParam(query.kind);
  const tab: Tab = TABS.find((value) => value === rawTab) ?? 'all';
  const kind = ACCOUNT_KINDS.find((value) => value === tab) as AccountKind | undefined;
  const rawApp = firstParam(query.app);
  // App users of an app; on the other tabs, accounts of that tab that use it.
  const app =
    tab === 'admin' ? undefined : (WEBAPPS.find((value) => value === rawApp) as Webapp | undefined);
  const q = firstParam(query.q)?.trim() || undefined;
  const users = await adminListUsers({
    page: parsePage(query.page),
    role: tab === 'admin' ? 'ADMIN' : undefined,
    kind,
    app,
    q,
  });
  const invitation = firstParam(query.invitation);
  const newButton = <Button href="/admin/users/new">{t('new')}</Button>;
  const filtered = tab !== 'all' || app !== undefined || q !== undefined;
  const tabHref = (value: Tab) => ({
    pathname: '/admin/users' as const,
    query: {
      ...(value === 'all' ? {} : { kind: value }),
      ...(app && value !== 'admin' ? { app } : {}),
      ...(q ? { q } : {}),
    },
  });

  return (
    <>
      <PageHeader title={t('title')} actions={newButton} />
      {invitation === 'sent' && <Alert tone="success">{t('createdInvited')}</Alert>}
      {invitation === 'failed' && <Alert tone="error">{t('createdInvitationFailed')}</Alert>}
      <nav aria-label={t('kindsLabel')}>
        <ul className={styles.chips}>
          {TABS.map((value) => (
            <li key={value}>
              <Link href={tabHref(value)} aria-current={value === tab ? 'page' : undefined}>
                {value === 'all' ? t('allAccounts') : tk(`${value}Plural`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className={styles.muted}>{t(`kindHint.${tab}`)}</p>
      <form method="get" className={styles.filters}>
        {tab === 'all' ? null : <input type="hidden" name="kind" value={tab} />}
        {tab === 'admin' ? null : (
          <Select
            name="app"
            label={t('app')}
            placeholder={tc('all')}
            options={WEBAPPS.map((value) => ({ value, label: ta(`${value}.title`) }))}
            defaultValue={app ?? ''}
          />
        )}
        <Input
          name="q"
          type="search"
          label={t('search')}
          placeholder={t('searchPlaceholder')}
          defaultValue={q}
        />
        <button type="submit" className={buttonClassName({ variant: 'outline' })}>
          {tc('filter')}
        </button>
      </form>
      {users.items.length === 0 ? (
        filtered ? (
          <EmptyState title={t('noMatchTitle')} body={t('noMatchBody')} />
        ) : (
          <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={newButton} />
        )
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('name')}</th>
                  <th scope="col">{t('kind')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('created')}</th>
                </tr>
              </thead>
              <tbody>
                {users.items.map((user) => (
                  <tr key={user.id}>
                    <th scope="row">
                      <Link href={`/admin/users/${user.id}`}>{user.name}</Link>
                      <span className={styles.sub}>
                        {user.username ? `@${user.username} · ` : ''}
                        {user.email}
                      </span>
                      {user.memberOfId ? (
                        <span className={styles.sub}>
                          {t('memberOf')}{' '}
                          <Link href={`/admin/users/${user.memberOfId}`}>
                            {users.items.find((other) => other.id === user.memberOfId)?.name ??
                              t('companyAccount')}
                          </Link>
                        </span>
                      ) : null}
                    </th>
                    <td>
                      <AccountKindBadge user={user} />
                    </td>
                    <td>
                      <Badge tone={user.isActive ? 'success' : 'neutral'}>
                        {user.isActive ? t('active') : t('inactive')}
                      </Badge>{' '}
                      {user.registered ? null : <Badge tone="warning">{t('unregistered')}</Badge>}
                    </td>
                    <td>{formatDate(user.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={users.page}
            totalPages={users.totalPages}
            pathname="/admin/users"
            query={{ kind: tab === 'all' ? undefined : tab, app, q }}
          />
        </>
      )}
    </>
  );
}
