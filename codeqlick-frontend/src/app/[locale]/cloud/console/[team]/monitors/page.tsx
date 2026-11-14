import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormCheckboxGroup, FormInput, FormSelect } from '@/components/app/ActionForm';
import { MonitorStatus } from '@/components/cloud/MonitorStatus';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudTeam, listCloudMembers, listCloudMonitors } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import { createMonitorAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type PageProps = { params: Promise<{ locale: string; team: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.monitors' });
  return { title: t('title') };
}

/** A team's monitors (architecture 4.13): their state, and a new URL check or heartbeat. */
export default async function CloudMonitorsPage({ params }: PageProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  let data;
  try {
    data = await Promise.all([getCloudTeam(slug), listCloudMonitors(slug), listCloudMembers(slug)]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const [team, { items: monitors }, members] = data;
  const admin = team.role !== 'MEMBER';

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}`}>← {team.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>{t('monitors.title')}</h1>
        <p className={styles.muted}>{t('monitors.lead')}</p>
        <p className={styles.spacedSmall}>
          <Link href={`/cloud/console/${team.slug}/status-page`}>{t('statusPage.title')}</Link>
        </p>
      </div>

      {monitors.length === 0 ? (
        <p className={styles.muted}>{t('monitors.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {monitors.map((monitor) => (
            <li key={monitor.id} className={`${styles.row} ${styles.tileRow}`}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  <Link
                    href={`/cloud/console/${team.slug}/monitors/${monitor.id}`}
                    className={styles.tileLink}
                  >
                    {monitor.name}
                  </Link>
                  <MonitorStatus
                    status={monitor.status}
                    label={t(`monitors.states.${monitor.status}`)}
                  />
                </p>
                <p className={`${styles.small} ${styles.mono}`}>
                  {monitor.kind === 'HTTP'
                    ? monitor.url
                    : t('monitors.every', {
                        period: monitor.periodMinutes ?? 0,
                        grace: monitor.graceMinutes ?? 0,
                      })}
                </p>
                <p className={styles.small}>
                  {t('monitors.since', { when: formatWhen(monitor.statusSince, locale) })}
                  {monitor.lastError && monitor.status === 'DOWN' ? ` · ${monitor.lastError}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {admin ? (
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="new-monitor">
          <h2 id="new-monitor" className={styles.cardTitle}>
            {t('monitors.newTitle')}
          </h2>
          <ActionForm
            action={createMonitorAction.bind(null, locale, team.slug)}
            className={styles.form}
          >
            <FormInput
              name="name"
              label={t('monitors.name')}
              hint={t('monitors.nameHint')}
              required
              maxLength={60}
            />
            <FormSelect
              name="kind"
              label={t('monitors.kind')}
              defaultValue="HTTP"
              options={[
                { value: 'HTTP', label: t('monitors.kinds.HTTP') },
                { value: 'HEARTBEAT', label: t('monitors.kinds.HEARTBEAT') },
              ]}
            />
            <fieldset className={styles.fieldset}>
              <legend>{t('monitors.forHttp')}</legend>
              <FormInput
                name="url"
                type="url"
                label={t('monitors.url')}
                hint={t('monitors.urlHint')}
                placeholder="https://"
                mono
              />
              <FormInput
                name="keyword"
                label={t('monitors.text')}
                hint={t('monitors.textHint')}
                maxLength={100}
              />
              <FormSelect
                name="keywordMode"
                label={t('monitors.textMode')}
                defaultValue="CONTAINS"
                options={[
                  { value: 'CONTAINS', label: t('monitors.textModes.CONTAINS') },
                  { value: 'NOT_CONTAINS', label: t('monitors.textModes.NOT_CONTAINS') },
                ]}
              />
            </fieldset>
            <fieldset className={styles.fieldset}>
              <legend>{t('monitors.forHeartbeat')}</legend>
              <FormInput
                name="period"
                type="number"
                min={1}
                max={10080}
                label={t('monitors.period')}
                hint={t('monitors.periodHint')}
                defaultValue="60"
              />
              <FormInput
                name="grace"
                type="number"
                min={1}
                max={1440}
                label={t('monitors.grace')}
                hint={t('monitors.graceHint')}
                defaultValue="10"
              />
            </fieldset>
            <FormCheckboxGroup
              name="alerts"
              legend={t('monitors.alerts')}
              options={members.items.map((m) => ({
                value: m.userId,
                label: `${m.name} · ${m.email}`,
              }))}
              defaultValues={members.items.slice(0, 1).map((m) => m.userId)}
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('monitors.creating')}>
                {t('monitors.create')}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
