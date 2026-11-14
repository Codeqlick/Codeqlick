import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormCheckboxGroup,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { CloudMonitor, CloudStatusNotice } from '@/lib/api/cloud';
import type { Paginated } from '@/lib/api/types';
import { formatWhen } from '@/lib/cloud';
import { INCIDENT_STATES, noticeMonitorNames, noticeTone, updateStates } from '@/lib/cloud-notices';
import { toDateTimeInput } from '@/lib/format';
import {
  addNoticeUpdateAction,
  createNoticeAction,
  deleteNoticeAction,
  editNoticeAction,
} from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  team: string;
  admin: boolean;
  monitors: CloudMonitor[];
  open: CloudStatusNotice[];
  past: Paginated<CloudStatusNotice>;
};

/**
 * The status page's notices (architecture 4.13, Notices; decision 62): the open ones, the past ones
 * (paginated), and for an ADMIN or OWNER the forms to post, update, edit and delete them.
 */
export async function NoticesSection(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const options = props.monitors.map((m) => ({ value: m.id, label: m.name }));

  return (
    <section className={styles.landing} aria-labelledby="notices-title">
      <div>
        <h2 id="notices-title" className={styles.sectionTitle}>
          {t('notices.title')}
        </h2>
        <p className={styles.muted}>{t('notices.lead')}</p>
      </div>

      <section className={styles.form} aria-labelledby="notices-open">
        <h3 id="notices-open" className={styles.cardTitle}>
          {t('notices.open')}
        </h3>
        {props.open.length === 0 ? (
          <p className={styles.muted}>{t('notices.noOpen')}</p>
        ) : (
          <ul className={styles.list}>
            {props.open.map((notice) => (
              <li key={notice.id}>
                <NoticeCard {...props} notice={notice} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {props.admin ? (
        props.monitors.length === 0 ? (
          <p className={styles.muted}>{t('notices.noMonitors')}</p>
        ) : (
          <>
            <section
              className={`${styles.card} ${styles.narrow}`}
              aria-labelledby="notice-incident"
            >
              <h3 id="notice-incident" className={styles.cardTitle}>
                {t('notices.newIncident')}
              </h3>
              <ActionForm
                action={createNoticeAction.bind(null, props.locale, props.team, 'INCIDENT')}
                className={styles.form}
              >
                <FormInput
                  id="incident-title"
                  name="title"
                  label={t('notices.noticeTitle')}
                  required
                  maxLength={120}
                />
                <FormCheckboxGroup
                  name="monitors"
                  idPrefix="incident-monitors"
                  legend={t('notices.monitors')}
                  options={options}
                  className={styles.fieldset}
                />
                <FormSelect
                  id="incident-state"
                  name="state"
                  label={t('notices.initialState')}
                  options={INCIDENT_STATES.map((value) => ({
                    value,
                    label: t(`notices.states.${value}`),
                  }))}
                  defaultValue="INVESTIGATING"
                />
                <FormTextarea
                  id="incident-body"
                  name="body"
                  label={t('notices.message')}
                  hint={t('notices.messageHint')}
                  rows={4}
                  required
                  maxLength={2000}
                />
                <div className={styles.actions}>
                  <SubmitButton pendingLabel={t('notices.creating')}>
                    {t('notices.createIncident')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </section>

            <section
              className={`${styles.card} ${styles.narrow}`}
              aria-labelledby="notice-maintenance"
            >
              <h3 id="notice-maintenance" className={styles.cardTitle}>
                {t('notices.newMaintenance')}
              </h3>
              <ActionForm
                action={createNoticeAction.bind(null, props.locale, props.team, 'MAINTENANCE')}
                className={styles.form}
              >
                <FormInput
                  id="maintenance-title"
                  name="title"
                  label={t('notices.noticeTitle')}
                  required
                  maxLength={120}
                />
                <FormCheckboxGroup
                  name="monitors"
                  idPrefix="maintenance-monitors"
                  legend={t('notices.monitors')}
                  options={options}
                  className={styles.fieldset}
                />
                <FormInput
                  id="maintenance-start"
                  name="startsAt"
                  type="datetime-local"
                  label={t('notices.startsAt')}
                  hint={t('notices.windowHint')}
                  required
                />
                <FormInput
                  id="maintenance-end"
                  name="endsAt"
                  type="datetime-local"
                  label={t('notices.endsAt')}
                  required
                />
                <FormTextarea
                  id="maintenance-body"
                  name="body"
                  label={t('notices.message')}
                  hint={t('notices.messageHint')}
                  rows={4}
                  required
                  maxLength={2000}
                />
                <div className={styles.actions}>
                  <SubmitButton pendingLabel={t('notices.creating')}>
                    {t('notices.createMaintenance')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </section>
          </>
        )
      ) : null}

      <section className={styles.form} aria-labelledby="notices-past">
        <h3 id="notices-past" className={styles.cardTitle}>
          {t('notices.past')}
        </h3>
        {props.past.items.length === 0 ? (
          <p className={styles.muted}>{t('notices.noPast')}</p>
        ) : (
          <ul className={styles.list}>
            {props.past.items.map((notice) => (
              <li key={notice.id}>
                <NoticeCard {...props} notice={notice} />
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={props.past.page}
          totalPages={props.past.totalPages}
          pathname={`/cloud/console/${props.team}/status-page`}
        />
      </section>
    </section>
  );
}

/** One notice: its state, monitors, window, latest update, timeline and (ADMIN) its controls. */
async function NoticeCard({
  locale,
  team,
  admin,
  monitors,
  notice,
}: Props & { notice: CloudStatusNotice }) {
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const names = noticeMonitorNames(notice.monitorIds, monitors);
  const [latest] = notice.updates;
  const maintenance = notice.kind === 'MAINTENANCE';
  // A completed maintenance takes no more updates (409); a resolved incident can be reopened.
  const canUpdate = !maintenance || notice.open;
  // Once a maintenance has started the API only lets its monitors be removed, not added (400).
  const started = maintenance && notice.state === 'IN_PROGRESS';
  const by = (update: CloudStatusNotice['updates'][number]) =>
    update.createdBy
      ? t('notices.by', { when: formatWhen(update.createdAt, locale), name: update.createdBy })
      : formatWhen(update.createdAt, locale);
  const label = (state: CloudStatusNotice['updates'][number]['state']) =>
    state ? t(`notices.states.${state}`) : t('notices.note');
  const id = (field: string) => `notice-${notice.id}-${field}`;

  return (
    <article className={styles.card}>
      <p className={styles.rowTitle}>
        {notice.title}
        <Badge tone="neutral">{t(`notices.kinds.${notice.kind}`)}</Badge>
        <Badge tone={noticeTone(notice.kind, notice.state)}>
          {t(`notices.states.${notice.state}`)}
        </Badge>
      </p>
      {names.length > 0 ? (
        <p className={styles.small}>{t('notices.affects', { names: names.join(', ') })}</p>
      ) : null}
      {maintenance && notice.startsAt && notice.endsAt ? (
        <p className={styles.small}>
          {t('notices.window', {
            start: formatWhen(notice.startsAt, locale),
            end: formatWhen(notice.endsAt, locale),
          })}
        </p>
      ) : null}
      {latest ? (
        <div>
          <p className={styles.small}>
            {by(latest)} · {label(latest.state)}
          </p>
          <p className={styles.noticeBody}>{latest.body}</p>
        </div>
      ) : null}
      {notice.updates.length > 1 ? (
        <details>
          <summary className={styles.small}>
            {t('notices.timeline', { count: notice.updates.length })}
          </summary>
          <ol className={styles.timeline}>
            {notice.updates.map((update) => (
              <li key={update.id}>
                <p className={styles.small}>
                  {by(update)} · {label(update.state)}
                </p>
                <p className={styles.noticeBody}>{update.body}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {admin && canUpdate ? (
        <details>
          <summary className={styles.small}>{t('notices.postUpdate')}</summary>
          <ActionForm
            action={addNoticeUpdateAction.bind(null, locale, team, notice.id, notice.kind)}
            className={styles.form}
          >
            <FormSelect
              id={id('state')}
              name="state"
              label={maintenance ? t('notices.updateKind') : t('notices.updateState')}
              options={updateStates(notice.kind).map((value) => ({
                value,
                label:
                  value === ''
                    ? t('notices.maintenanceNote')
                    : value === 'COMPLETED'
                      ? t('notices.markCompleted')
                      : t(`notices.states.${value}`),
              }))}
              defaultValue={maintenance ? '' : notice.state}
            />
            <FormTextarea
              id={id('body')}
              name="body"
              label={t('notices.message')}
              hint={t('notices.messageHint')}
              rows={3}
              required
              maxLength={2000}
            />
            <div className={styles.actions}>
              <SubmitButton size="sm" pendingLabel={t('notices.creating')}>
                {t('notices.send')}
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}

      {admin && maintenance && notice.open ? (
        <details>
          <summary className={styles.small}>{t('notices.editWindow')}</summary>
          <ActionForm
            action={editNoticeAction.bind(null, locale, team, notice.id, {
              startsAt: notice.startsAt,
              endsAt: notice.endsAt,
            })}
            className={styles.form}
          >
            <FormInput
              id={id('title')}
              name="title"
              label={t('notices.noticeTitle')}
              defaultValue={notice.title}
              required
              maxLength={120}
            />
            <FormCheckboxGroup
              name="monitors"
              idPrefix={id('monitors')}
              legend={t('notices.monitors')}
              options={(started
                ? monitors.filter((m) => notice.monitorIds.includes(m.id))
                : monitors
              ).map((m) => ({ value: m.id, label: m.name }))}
              defaultValues={notice.monitorIds}
              className={styles.fieldset}
            />
            {started ? <p className={styles.small}>{t('notices.inProgressHint')}</p> : null}
            <FormInput
              id={id('start')}
              name="startsAt"
              type="datetime-local"
              label={t('notices.startsAt')}
              hint={t('notices.windowHint')}
              defaultValue={toDateTimeInput(notice.startsAt)}
              required
            />
            <FormInput
              id={id('end')}
              name="endsAt"
              type="datetime-local"
              label={t('notices.endsAt')}
              defaultValue={toDateTimeInput(notice.endsAt)}
              required
            />
            <div className={styles.actions}>
              <SubmitButton size="sm" pendingLabel={t('notices.saving')}>
                {t('notices.save')}
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}

      {admin ? (
        <details>
          <summary className={styles.small}>{t('notices.delete')}</summary>
          <ActionForm
            action={deleteNoticeAction.bind(null, locale, team, notice.id)}
            className={styles.form}
          >
            <FormCheckbox id={id('confirm')} name="confirm" label={t('notices.deleteConfirm')} />
            <div className={styles.actions}>
              <SubmitButton size="sm" variant="danger" pendingLabel={t('notices.deleting')}>
                {t('notices.delete')}
                <span className="visually-hidden"> — {notice.title}</span>
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      ) : null}
    </article>
  );
}
