import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormCheckboxGroup,
  FormInput,
  FormSelect,
} from '@/components/app/ActionForm';
import { TokenReveal } from '@/components/cloud/TokenReveal';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { listCloudMembers, listCloudNotifications, type CloudNotifyChannel } from '@/lib/api/cloud';
import { formatWhen } from '@/lib/cloud';
import {
  createNotifyAction,
  deleteNotifyAction,
  testNotifyAction,
  toggleNotifyAction,
  updateNotifyAction,
} from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  teamSlug: string;
  projectId: string;
  path: string;
  admin: boolean;
};

/** A project's build notifications and monitor alerts (architecture 4.13, decisions 43 and 64). */
export async function NotificationsTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const channels = await listCloudNotifications(props.projectId)
    .then((result) => result.items)
    .catch(() => null);
  if (channels === null) return <p className={styles.muted}>{t('common.loadError')}</p>;
  const members = props.admin
    ? await listCloudMembers(props.teamSlug)
        .then((result) => result.items)
        .catch(() => [])
    : [];
  const people = members.map((member) => ({
    value: member.userId,
    label: `${member.name} · ${member.email}`,
  }));
  const names = new Map(members.map((member) => [member.userId, member.name]));
  const hidden = (channel: CloudNotifyChannel) => (
    <>
      <input type="hidden" name="locale" value={props.locale} />
      <input type="hidden" name="project" value={props.projectId} />
      <input type="hidden" name="id" value={channel.id} />
      <input type="hidden" name="path" value={props.path} />
    </>
  );
  const events = (channel: CloudNotifyChannel) =>
    [
      channel.buildFailed ? t('notify.failed') : null,
      channel.buildSucceeded ? t('notify.succeeded') : null,
      channel.previews ? t('notify.withPreviews') : t('notify.productionOnly'),
      channel.monitorAlerts ? t('notify.monitors') : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <section className={styles.landing} aria-labelledby="notify-title">
      <div>
        <h2 id="notify-title" className={styles.sectionTitle}>
          {t('project.tabs.notifications')}
        </h2>
        <p className={styles.muted}>{t('notify.lead')}</p>
      </div>
      {channels.length === 0 ? <p className={styles.muted}>{t('notify.empty')}</p> : null}
      {channels.map((channel) => (
        <article key={channel.id} className={styles.card}>
          <p className={styles.rowTitle}>
            {channel.name}
            <Badge tone="brand">{t(`notify.kinds.${channel.kind}`)}</Badge>
            <Badge tone={channel.enabled ? 'success' : 'neutral'}>
              {channel.enabled ? t('notify.on') : t('notify.off')}
            </Badge>
          </p>
          <p className={styles.small}>
            {channel.kind === 'EMAIL'
              ? channel.recipientIds.map((id) => names.get(id) ?? '—').join(', ')
              : channel.hint}
            {' · '}
            {events(channel)}
          </p>
          <p className={styles.small}>
            {channel.lastSentAt ? (
              <>
                {channel.lastOk ? '✅ ' : '❌ '}
                {t('notify.last', { when: formatWhen(channel.lastSentAt, props.locale) })}
                {channel.lastError ? ` — ${channel.lastError}` : ''}
              </>
            ) : (
              t('notify.never')
            )}
          </p>
          {props.admin ? (
            <>
              <div className={styles.actions}>
                <ActionForm
                  action={testNotifyAction.bind(
                    null,
                    props.locale,
                    props.path,
                    props.projectId,
                    channel.id,
                  )}
                >
                  <SubmitButton size="sm" variant="outline" pendingLabel={t('notify.testing')}>
                    {t('notify.test')}
                  </SubmitButton>
                </ActionForm>
                <form action={toggleNotifyAction}>
                  {hidden(channel)}
                  <input type="hidden" name="enabled" value={channel.enabled ? 'off' : 'on'} />
                  <SubmitButton size="sm" variant="ghost">
                    {channel.enabled ? t('notify.pause') : t('notify.resume')}
                  </SubmitButton>
                </form>
                <form action={deleteNotifyAction}>
                  {hidden(channel)}
                  <SubmitButton size="sm" variant="ghost">
                    {t('notify.delete')}
                    <span className="visually-hidden"> — {channel.name}</span>
                  </SubmitButton>
                </form>
              </div>
              <details>
                <summary className={styles.small}>{t('notify.edit')}</summary>
                <ActionForm
                  action={updateNotifyAction.bind(
                    null,
                    props.locale,
                    props.path,
                    props.projectId,
                    channel.id,
                    channel.kind,
                  )}
                  className={styles.form}
                >
                  <FormInput
                    id={`${channel.id}-name`}
                    name="name"
                    label={t('notify.name')}
                    defaultValue={channel.name}
                    required
                    maxLength={60}
                  />
                  {channel.kind === 'EMAIL' ? (
                    <FormCheckboxGroup
                      idPrefix={`${channel.id}-recipients`}
                      name="recipients"
                      legend={t('notify.recipients')}
                      options={people}
                      defaultValues={channel.recipientIds}
                    />
                  ) : (
                    <FormInput
                      id={`${channel.id}-url`}
                      name="url"
                      type="url"
                      label={t('notify.newUrl')}
                      hint={t('notify.newUrlHint', { hint: channel.hint ?? '' })}
                      maxLength={2048}
                    />
                  )}
                  <FormCheckbox
                    id={`${channel.id}-failed`}
                    name="buildFailed"
                    label={t('notify.onFailed')}
                    defaultChecked={channel.buildFailed}
                  />
                  <FormCheckbox
                    id={`${channel.id}-succeeded`}
                    name="buildSucceeded"
                    label={t('notify.onSucceeded')}
                    defaultChecked={channel.buildSucceeded}
                  />
                  <FormCheckbox
                    id={`${channel.id}-previews`}
                    name="previews"
                    label={t('notify.onPreviews')}
                    defaultChecked={channel.previews}
                  />
                  {channel.kind === 'EMAIL' ? null : (
                    <FormCheckbox
                      id={`${channel.id}-monitors`}
                      name="monitorAlerts"
                      label={t('notify.onMonitors')}
                      hint={t('notify.onMonitorsHint')}
                      defaultChecked={channel.monitorAlerts}
                    />
                  )}
                  <div className={styles.actions}>
                    <SubmitButton size="sm" pendingLabel={t('notify.saving')}>
                      {t('notify.save')}
                    </SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </>
          ) : null}
        </article>
      ))}

      {props.admin ? (
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="new-notify">
          <h3 id="new-notify" className={styles.cardTitle}>
            {t('notify.newTitle')}
          </h3>
          <ActionForm
            action={createNotifyAction.bind(null, props.locale, props.path, props.projectId)}
            className={styles.form}
          >
            <TokenReveal />
            <FormInput
              name="name"
              label={t('notify.name')}
              hint={t('notify.nameHint')}
              required
              maxLength={60}
            />
            <FormSelect
              name="kind"
              label={t('notify.kind')}
              defaultValue="EMAIL"
              options={(['EMAIL', 'SLACK', 'DISCORD', 'WEBHOOK'] as const).map((kind) => ({
                value: kind,
                label: t(`notify.kinds.${kind}`),
              }))}
            />
            <FormCheckboxGroup
              name="recipients"
              legend={t('notify.recipientsHint')}
              options={people}
              defaultValues={people.slice(0, 1).map((person) => person.value)}
            />
            <FormInput
              name="url"
              type="url"
              label={t('notify.url')}
              hint={t('notify.urlHint')}
              maxLength={2048}
            />
            <FormCheckbox name="buildFailed" label={t('notify.onFailed')} defaultChecked />
            <FormCheckbox name="buildSucceeded" label={t('notify.onSucceeded')} />
            <FormCheckbox name="previews" label={t('notify.onPreviews')} />
            <FormCheckbox
              name="monitorAlerts"
              label={t('notify.onMonitorsNew')}
              hint={t('notify.onMonitorsHint')}
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('notify.creating')}>{t('notify.create')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </section>
  );
}
