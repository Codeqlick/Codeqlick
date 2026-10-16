import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListSites } from '@/lib/api/managed-sites';
import { formatDateTime } from '@/lib/format';

const TONES = { NONE: 'neutral', BUILDING: 'warning', LIVE: 'success', FAILED: 'danger' } as const;
const DOMAIN_TONES = { UNREGISTERED: 'neutral', ELSEWHERE: 'warning', LIVE: 'success' } as const;

/** Every managed basic website, newest first. */
export default async function AdminSitesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.sites' });
  const tm = await getTranslations({ locale, namespace: 'ManagedSite' });
  const tk = (key: string) => tm(key as never);
  const sites = await adminListSites();

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Button href="/admin/sites/new" size="sm">
            {t('new')}
          </Button>
        }
      />
      {sites.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('site')}</th>
                <th scope="col">{t('client')}</th>
                <th scope="col">{t('status')}</th>
                <th scope="col">{t('domain')}</th>
                <th scope="col">{t('lastBuild')}</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.projectId}>
                  <th scope="row">
                    <Link href={`/admin/projects/${site.projectId}#site`}>{site.project.name}</Link>
                    <span className={styles.sub}>
                      <a href={site.url} target="_blank" rel="noopener noreferrer">
                        {site.url.replace('https://', '')}
                      </a>
                    </span>
                  </th>
                  <td>{site.client.name}</td>
                  <td>
                    <Badge tone={TONES[site.status]}>{tk(`statuses.${site.status}`)}</Badge>
                  </td>
                  <td>
                    {site.domain ? (
                      <>
                        {site.domain}
                        <span className={styles.sub}>
                          <Badge
                            tone={site.domainState ? DOMAIN_TONES[site.domainState] : 'neutral'}
                          >
                            {tk(`domainStates.${site.domainState ?? 'UNCHECKED'}`)}
                          </Badge>
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{site.lastBuildAt ? formatDateTime(site.lastBuildAt, locale) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
