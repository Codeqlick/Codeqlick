import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListUsers } from '@/lib/api/users';
import { formatDate, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminUsersPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  const tr = await getTranslations({ locale, namespace: 'Roles' });
  const users = await adminListUsers({ page: parsePage((await searchParams).page) });
  const newButton = <Button href="/admin/users/new">{t('new')}</Button>;

  return (
    <>
      <PageHeader title={t('title')} actions={newButton} />
      {users.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={newButton} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('name')}</th>
                  <th scope="col">{t('role')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('created')}</th>
                </tr>
              </thead>
              <tbody>
                {users.items.map((user) => (
                  <tr key={user.id}>
                    <th scope="row">
                      <Link href={`/admin/users/${user.id}`}>{user.name}</Link>
                      <span className={styles.sub}>{user.email}</span>
                    </th>
                    <td>
                      <Badge tone={user.role === 'ADMIN' ? 'ink' : 'brand'}>{tr(user.role)}</Badge>
                    </td>
                    <td>
                      <Badge tone={user.isActive ? 'success' : 'neutral'}>
                        {user.isActive ? t('active') : t('inactive')}
                      </Badge>
                    </td>
                    <td>{formatDate(user.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={users.page} totalPages={users.totalPages} pathname="/admin/users" />
        </>
      )}
    </>
  );
}
