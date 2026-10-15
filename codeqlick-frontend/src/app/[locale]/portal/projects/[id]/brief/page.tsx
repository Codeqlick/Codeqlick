import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { getMyBrief } from '@/lib/api/briefs';
import { isNotFound } from '@/lib/api/errors';
import { getMyProject } from '@/lib/api/projects';
import { BRIEF_SECTIONS } from '@/lib/brief';
import { formatDateTime } from '@/lib/format';
import brief from './brief.module.css';
import { saveBriefAction } from './actions';

export default async function PortalBriefPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Brief' });
  // Keys built from the question list (lib/brief.ts), all present in the Brief messages.
  const tk = (key: string) => t(key as never);
  const tc = await getTranslations({ locale, namespace: 'Common' });

  let data;
  let project;
  try {
    [data, project] = await Promise.all([getMyBrief(id), getMyProject(id)]);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead', { project: project.name })}
        back={{ href: `/portal/projects/${id}`, label: project.name }}
      />
      {data.status === 'SUBMITTED' && data.submittedAt ? (
        <Alert tone="success">
          {t('submittedNotice', { date: formatDateTime(data.submittedAt, locale) })}
        </Alert>
      ) : null}
      {/* Keyed by the last save: the fields show what was stored. */}
      <ActionForm
        key={data.updatedAt ?? 'new'}
        action={saveBriefAction.bind(null, locale, id)}
        className={brief.form}
      >
        {BRIEF_SECTIONS.map((section, index) => (
          <section key={section.key} className={`${styles.panel} ${brief.section}`}>
            <h2 className={brief.sectionTitle}>
              <span className={brief.step}>{index + 1}</span>
              {tk(`sections.${section.key}.title`)}
            </h2>
            <p className={styles.muted}>{tk(`sections.${section.key}.lead`)}</p>
            {section.fields.map((field) => {
              const common = {
                id: `brief-${field.key}`,
                name: field.key,
                label: tk(`fields.${field.key}.label`),
                hint: t.has(`fields.${field.key}.hint` as never)
                  ? tk(`fields.${field.key}.hint`)
                  : undefined,
                optionalLabel: field.required ? undefined : tc('optional'),
                defaultValue: data.answers[field.key] ?? '',
              };
              if (field.kind === 'textarea')
                return <FormTextarea key={field.key} {...common} rows={field.rows ?? 4} />;
              if (field.kind === 'select') {
                return (
                  <FormSelect
                    key={field.key}
                    {...common}
                    placeholder={t('choose')}
                    options={(field.options ?? []).map((value) => ({
                      value,
                      label: tk(`options.${field.key}.${value}`),
                    }))}
                  />
                );
              }
              return (
                <FormInput
                  key={field.key}
                  {...common}
                  type={field.kind === 'url' ? 'url' : field.kind === 'date' ? 'date' : 'text'}
                />
              );
            })}
          </section>
        ))}
        <div className={brief.actions}>
          <p className={styles.muted}>{t('actionsHint')}</p>
          <div className={styles.actions}>
            <SubmitButton name="intent" value="save" variant="outline" pendingLabel={t('saving')}>
              {t('save')}
            </SubmitButton>
            <SubmitButton name="intent" value="submit" pendingLabel={t('sending')}>
              {data.status === 'SUBMITTED' ? t('sendAgain') : t('send')}
            </SubmitButton>
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
