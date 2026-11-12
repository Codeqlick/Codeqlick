import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormCheckboxGroup,
  FormInput,
} from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import {
  listCloudForms,
  listCloudMembers,
  listCloudSubmissions,
  type CloudForm,
} from '@/lib/api/cloud';
import { formatWhen } from '@/lib/cloud';
import { appPath } from '@/lib/webapp-request';
import {
  createFormAction,
  deleteFormAction,
  deleteSubmissionAction,
  replaceFormKeyAction,
  toggleFormAction,
} from '../../../actions';
import styles from '../../../cloud.module.css';

/** The HTML a page pastes: a plain form posting to the endpoint, with the honeypot. */
function snippet(form: CloudForm, es: boolean): string {
  return [
    `<form action="${form.endpoint}" method="POST">`,
    `  <input name="name" placeholder="${es ? 'Nombre' : 'Name'}" required>`,
    '  <input name="email" type="email" placeholder="Email" required>',
    `  <textarea name="message" placeholder="${es ? 'Mensaje' : 'Message'}" required></textarea>`,
    '  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">',
    `  <button type="submit">${es ? 'Enviar' : 'Send'}</button>`,
    '</form>',
  ].join('\n');
}

type Props = {
  locale: AppLocale;
  teamSlug: string;
  projectId: string;
  projectSlug: string;
  path: string;
  base: string;
  admin: boolean;
  formId?: string;
  q?: string;
  page: number;
};

/** The project's forms (architecture 4.13, Forms): list, snippet, new form, submissions. */
export async function FormsTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const forms = await listCloudForms(props.projectId)
    .then((result) => result.items)
    .catch(() => null);
  if (forms === null) return <p className={styles.muted}>{t('common.loadError')}</p>;
  const current = props.formId ? forms.find((form) => form.id === props.formId) : undefined;
  if (current) return <Submissions {...props} form={current} />;

  const members = props.admin
    ? await listCloudMembers(props.teamSlug)
        .then((result) => result.items)
        .catch(() => [])
    : [];
  const hidden = (form: CloudForm) => (
    <>
      <input type="hidden" name="locale" value={props.locale} />
      <input type="hidden" name="project" value={props.projectId} />
      <input type="hidden" name="id" value={form.id} />
      <input type="hidden" name="path" value={props.path} />
    </>
  );

  return (
    <section className={styles.landing} aria-labelledby="forms-title">
      <div>
        <h2 id="forms-title" className={styles.sectionTitle}>
          {t('project.tabs.forms')}
        </h2>
        <p className={styles.muted}>{t('forms.lead')}</p>
      </div>
      {forms.length === 0 ? <p className={styles.muted}>{t('forms.empty')}</p> : null}
      {forms.map((form) => (
        <article key={form.id} className={styles.card}>
          <p className={styles.rowTitle}>
            {form.name}
            <Badge tone={form.enabled ? 'success' : 'neutral'}>
              {form.enabled ? t('forms.on') : t('forms.off')}
            </Badge>
            {form.notify ? <Badge>{t('forms.emails')}</Badge> : null}
          </p>
          <p className={styles.small}>
            <Link href={`${props.base}?tab=forms&form=${form.id}`}>
              {t('forms.submissions', { count: form.submissions })}
            </Link>
          </p>
          <CopyLink
            url={form.endpoint}
            labels={{ copy: t('common.copy'), copied: t('common.copied') }}
          />
          <details>
            <summary className={styles.small}>{t('forms.snippet')}</summary>
            <pre className={styles.terminal}>{snippet(form, props.locale === 'es')}</pre>
            <p className={styles.small}>{t('forms.snippetHelp')}</p>
          </details>
          {props.admin ? (
            <div className={styles.actions}>
              <form action={toggleFormAction}>
                {hidden(form)}
                <input type="hidden" name="enabled" value={form.enabled ? 'off' : 'on'} />
                <SubmitButton size="sm" variant="outline">
                  {form.enabled ? t('forms.pause') : t('forms.resume')}
                </SubmitButton>
              </form>
              <form action={replaceFormKeyAction}>
                {hidden(form)}
                <SubmitButton size="sm" variant="ghost">
                  {t('forms.newKey')}
                </SubmitButton>
              </form>
              <form action={deleteFormAction}>
                {hidden(form)}
                <SubmitButton size="sm" variant="ghost">
                  {t('forms.delete')}
                  <span className="visually-hidden"> — {form.name}</span>
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </article>
      ))}

      {props.admin ? (
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="new-form">
          <h3 id="new-form" className={styles.cardTitle}>
            {t('forms.newTitle')}
          </h3>
          <ActionForm
            action={createFormAction.bind(null, props.locale, props.path, props.projectId)}
            className={styles.form}
          >
            <FormInput
              name="name"
              label={t('forms.name')}
              hint={t('forms.nameHint')}
              required
              maxLength={60}
            />
            <FormCheckboxGroup
              name="recipients"
              legend={t('forms.recipients')}
              options={members.map((member) => ({
                value: member.userId,
                label: `${member.name} · ${member.email}`,
              }))}
              defaultValues={members.slice(0, 1).map((member) => member.userId)}
            />
            <FormCheckbox name="notify" label={t('forms.notify')} defaultChecked />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('forms.creating')}>{t('forms.create')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </section>
  );
}

async function Submissions(props: Props & { form: CloudForm }) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const list = await listCloudSubmissions(
    props.projectId,
    props.form.id,
    props.q,
    props.page,
  ).catch(() => null);
  const csv = await appPath(
    `/${props.locale}/cloud/console/${props.teamSlug}/${props.projectSlug}/forms/${props.form.id}/csv`,
    props.locale,
  );
  return (
    <section className={styles.landing} aria-labelledby="submissions-title">
      <div>
        <p className={styles.small}>
          <Link href={`${props.base}?tab=forms`}>← {t('project.tabs.forms')}</Link>
        </p>
        <h2 id="submissions-title" className={styles.sectionTitle}>
          {props.form.name}
        </h2>
        <div className={styles.actions}>
          <form method="get" className={styles.actions}>
            <input type="hidden" name="tab" value="forms" />
            <input type="hidden" name="form" value={props.form.id} />
            <label className="visually-hidden" htmlFor="q">
              {t('forms.search')}
            </label>
            <input
              id="q"
              name="q"
              defaultValue={props.q}
              placeholder={t('forms.search')}
              className={styles.select}
            />
            <SubmitButton size="sm" variant="outline">
              {t('forms.search')}
            </SubmitButton>
          </form>
          <a href={csv} className={styles.small} download>
            {t('forms.csv')}
          </a>
        </div>
      </div>
      {list === null ? (
        <p className={styles.muted}>{t('common.loadError')}</p>
      ) : list.items.length === 0 ? (
        <p className={styles.muted}>{t('forms.noSubmissions')}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {list.items.map((submission) => (
              <li key={submission.id} className={styles.card}>
                <p className={styles.small}>
                  {formatWhen(submission.createdAt, props.locale)}
                  {submission.page ? ` · ${submission.page}` : ''}
                </p>
                <dl className={styles.fields}>
                  {Object.entries(submission.data).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>
                        {name === 'email' && submission.email === value ? (
                          <a href={`mailto:${value}`}>{value}</a>
                        ) : (
                          value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                <form action={deleteSubmissionAction}>
                  <input type="hidden" name="locale" value={props.locale} />
                  <input type="hidden" name="project" value={props.projectId} />
                  <input type="hidden" name="form" value={props.form.id} />
                  <input type="hidden" name="id" value={submission.id} />
                  <input type="hidden" name="path" value={props.path} />
                  <SubmitButton size="sm" variant="ghost">
                    {t('forms.deleteSubmission')}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.page}
            totalPages={list.totalPages}
            pathname={props.base}
            query={{ tab: 'forms', form: props.form.id, q: props.q }}
          />
        </>
      )}
    </section>
  );
}
