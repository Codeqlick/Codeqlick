import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Input } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudTeam, listCloudEvents } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { cloudEventFilters, cloudEventFiltersQuery, formatWhen } from '@/lib/cloud';
import { appPath } from '@/lib/webapp-request';
import styles from '../../../cloud.module.css';

type PageProps = {
  params: Promise<{ locale: string; team: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.events' });
  return { title: t('title') };
}

/** Everything that changed in a team, newest first, filtered by period and action; CSV export. */
export default async function CloudEventsPage({ params, searchParams }: PageProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const query = await searchParams;
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const page = Math.max(1, Number(rawPage) || 1);
  const filters = cloudEventFilters(query);
  const filtered = Object.keys(filters).length > 0;
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  let data;
  try {
    data = await Promise.all([
      getCloudTeam(slug),
      // 400: the filters are not valid (`from` after `to`, over 365 days apart, a malformed action).
      listCloudEvents(slug, page, filters).catch((error: unknown) => {
        if (isApiError(error) && error.status === 400) return null;
        throw error;
      }),
    ]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const [team, events] = data;
  const pathname = `/cloud/console/${team.slug}/events`;
  const canExport = (team.role === 'OWNER' || team.role === 'ADMIN') && events !== null;
  const csv = canExport
    ? `${await appPath(`/${locale}${pathname}/csv`, locale)}${cloudEventFiltersQuery(filters)}`
    : null;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}`}>← {team.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>{t('events.title')}</h1>
        <p className={styles.muted}>{t('events.lead')}</p>
      </div>

      <form method="get" className={styles.filters} aria-label={t('events.filters')}>
        <Input name="from" type="date" label={t('events.from')} defaultValue={filters.from} />
        <Input name="to" type="date" label={t('events.to')} defaultValue={filters.to} />
        <Input
          name="action"
          label={t('events.action')}
          hint={t('events.actionHint')}
          defaultValue={filters.action}
          maxLength={60}
          pattern="[a-zA-Z_]+(\.[a-zA-Z_]+)*\.?"
          mono
          autoComplete="off"
          spellCheck={false}
        />
        <div className={styles.actions}>
          <SubmitButton size="sm" variant="outline">
            {t('events.apply')}
          </SubmitButton>
          {filtered ? (
            <Link href={pathname} className={styles.small}>
              {t('events.clear')}
            </Link>
          ) : null}
        </div>
      </form>

      {csv ? (
        <div className={styles.actions}>
          <a href={csv} className={buttonClassName({ variant: 'outline', size: 'sm' })}>
            {t('events.export')}
          </a>
          <p className={styles.small}>{t('events.exportHint')}</p>
        </div>
      ) : null}

      {events === null ? (
        <p className={styles.muted}>{t('events.invalidFilters')}</p>
      ) : events.items.length === 0 ? (
        <p className={styles.muted}>{filtered ? t('events.noMatches') : t('events.empty')}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {events.items.map((event) => (
              <li key={event.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <span className={styles.mono}>{event.action}</span>
                    {event.targetLabel ? <span>{event.targetLabel}</span> : null}
                  </p>
                  <p className={styles.small}>
                    {formatWhen(event.createdAt, locale)} · {event.actor.name}
                    {event.token ? ` · ${t('events.via', { token: event.token })}` : ''}
                    {event.ip ? ` · ${event.ip}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={events.page}
            totalPages={events.totalPages}
            pathname={pathname}
            query={filters}
          />
        </>
      )}
    </div>
  );
}
