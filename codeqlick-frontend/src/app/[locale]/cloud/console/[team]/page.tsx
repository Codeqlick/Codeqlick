import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudTeam, getCloudUsage, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatBytes, formatWhen } from '@/lib/cloud';
import { env } from '@/lib/env';
import { createProjectAction, deleteTeamAction, renameTeamAction } from '../../actions';
import styles from '../../cloud.module.css';

/** The monthly meters the usage card adds to the ones it always shows. */
const MONTHLY: Record<string, true> = {
  builds: true,
  formSubmissions: true,
  analyticsEvents: true,
};

type PageProps = { params: Promise<{ locale: string; team: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { team } = await params;
  return { title: team };
}

async function load(team: string) {
  try {
    return await Promise.all([getCloudTeam(team), getCloudUsage(team), listCloudProjects(team)]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

/** A team: its projects, usage against the plan, and its settings. */
export default async function CloudTeamPage({ params }: PageProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const [team, usage, { items: projects }] = await load(slug);
  const admin = team.role !== 'MEMBER';
  const of = (used: string | number, limit: string | number) =>
    t('team.of', { used: String(used), limit: String(limit) });

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href="/cloud/console">← {t('console.title')}</Link>
        </p>
        <h1 className={styles.heroTitle}>{team.name}</h1>
        <p className={styles.muted}>
          {t('team.role', { role: t(`common.roles.${team.role}`) })} ·{' '}
          {t('team.plan', { plan: team.plan })}
        </p>
        <div className={`${styles.tabs} ${styles.spacedTabs}`}>
          <Link href={`/cloud/console/${team.slug}`} className={styles.tab} aria-current="page">
            {t('team.projects')}
          </Link>
          <Link href={`/cloud/console/${team.slug}/members`} className={styles.tab}>
            {t('team.membersLink')}
          </Link>
          <Link href={`/cloud/console/${team.slug}/monitors`} className={styles.tab}>
            {t('team.monitorsLink')}
          </Link>
          <Link href={`/cloud/console/${team.slug}/audits`} className={styles.tab}>
            {t('team.auditsLink')}
          </Link>
          <Link href={`/cloud/console/${team.slug}/events`} className={styles.tab}>
            {t('team.eventsLink')}
          </Link>
          <Link href={`/cloud/console/${team.slug}/plan`} className={styles.tab}>
            {t('team.planLink')}
          </Link>
        </div>
      </div>

      <section aria-labelledby="projects-title">
        <h2 id="projects-title" className={styles.sectionTitle}>
          {t('team.projects')}
        </h2>
        {projects.length === 0 ? (
          <p className={styles.muted}>{t('team.empty')}</p>
        ) : (
          <ul className={styles.grid}>
            {projects.map((project) => (
              <li key={project.id} className={styles.tile}>
                <Link
                  href={`/cloud/console/${team.slug}/${project.slug}`}
                  className={styles.tileLink}
                >
                  {project.name}
                </Link>
                <p className={`${styles.small} ${styles.mono}`}>
                  {project.url.replace('https://', '')}
                </p>
                <p className={styles.small}>
                  {project.suspended ? (
                    <Badge tone="danger">{t('team.suspended')}</Badge>
                  ) : project.production ? (
                    t('team.published', { when: formatWhen(project.production.createdAt, locale) })
                  ) : (
                    t('team.noProduction')
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin ? (
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="new-title">
          <h2 id="new-title" className={styles.cardTitle}>
            {t('team.newTitle')}
          </h2>
          <ActionForm
            action={createProjectAction.bind(null, locale, team.slug)}
            className={styles.form}
          >
            <FormInput name="name" label={t('team.projectName')} required maxLength={60} />
            <FormInput
              name="slug"
              label={t('team.projectSlug')}
              hint={t('team.projectSlugHint', { slug: '…', domain: env.CLOUD_HOSTING_DOMAIN })}
              required
              maxLength={40}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              autoCapitalize="none"
              spellCheck={false}
              mono
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('team.creating')}>{t('team.create')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      <section className={styles.card} aria-labelledby="usage-title">
        <h2 id="usage-title" className={styles.cardTitle}>
          {t('team.usage')}
        </h2>
        <div className={styles.meters}>
          <div className={styles.meter}>
            <span className={styles.small}>{t('team.projectsCount')}</span>
            <span className={styles.meterValue}>
              {of(usage.projects, usage.limits.projectsPerTeam)}
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.small}>{t('team.storage')}</span>
            <span className={styles.meterValue}>
              {of(
                formatBytes(usage.storageBytes, locale),
                formatBytes(usage.limits.storageBytesPerTeam, locale),
              )}
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.small}>{t('team.deployments')}</span>
            <span className={styles.meterValue}>
              {of(usage.deploymentsLastHour, usage.limits.deploymentsPerHour)}
            </span>
          </div>
          {(usage.meters ?? [])
            .filter((meter) => meter.key in MONTHLY)
            .map((meter) => (
              <div key={meter.key} className={styles.meter}>
                <span className={styles.small}>{t(`team.meters.${meter.key}`)}</span>
                <span className={styles.meterValue}>{of(meter.used, meter.limit)}</span>
              </div>
            ))}
          <div className={styles.meter}>
            <span className={styles.small}>{t('team.members')}</span>
            <span className={styles.meterValue}>
              {of(usage.members, usage.limits.membersPerTeam)}
            </span>
          </div>
        </div>
      </section>

      {admin ? (
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="settings-title">
          <h2 id="settings-title" className={styles.cardTitle}>
            {t('team.settings')}
          </h2>
          <ActionForm
            action={renameTeamAction.bind(null, locale, team.slug)}
            className={styles.form}
          >
            <FormInput
              name="name"
              label={t('console.name')}
              defaultValue={team.name}
              required
              maxLength={60}
            />
            <div className={styles.actions}>
              <SubmitButton variant="outline" pendingLabel={tc('saving')}>
                {t('team.rename')}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      {team.role === 'OWNER' ? (
        <section
          className={`${styles.card} ${styles.narrow} ${styles.danger}`}
          aria-labelledby="delete-title"
        >
          <h2 id="delete-title" className={styles.cardTitle}>
            {t('team.deleteTitle')}
          </h2>
          <p className={styles.muted}>{t('team.deleteBody')}</p>
          <ActionForm
            action={deleteTeamAction.bind(null, locale, team.slug)}
            className={styles.form}
          >
            <FormInput
              name="confirm"
              label={tc('confirmType', { text: team.slug })}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <div className={styles.actions}>
              <SubmitButton variant="danger" pendingLabel={tc('deleting')}>
                {tc('delete')}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
