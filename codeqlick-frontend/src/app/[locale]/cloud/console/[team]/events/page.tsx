import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudTeam, listCloudEvents } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import styles from '../../../cloud.module.css';

type PageProps = {
  params: Promise<{ locale: string; team: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.events' });
  return { title: t('title') };
}

/** Everything that changed in a team, newest first. */
export default async function CloudEventsPage({ params, searchParams }: PageProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  let data;
  try {
    data = await Promise.all([getCloudTeam(slug), listCloudEvents(slug, page)]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const [team, events] = data;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}`}>← {team.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>{t('events.title')}</h1>
        <p className={styles.muted}>{t('events.lead')}</p>
      </div>
      {events.items.length === 0 ? (
        <p className={styles.muted}>{t('events.empty')}</p>
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
            pathname={`/cloud/console/${team.slug}/events`}
          />
        </>
      )}
    </div>
  );
}
