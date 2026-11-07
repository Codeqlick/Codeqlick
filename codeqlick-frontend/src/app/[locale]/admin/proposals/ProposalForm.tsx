import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, type FormAction } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { MarkdownField } from '@/components/app/MarkdownField';
import { markdownPreviewLabels } from '@/components/app/markdownPreviewLabels';
import { ProposalItemsField } from '@/components/app/ProposalItemsField';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { adminListProjects } from '@/lib/api/projects';
import type { Proposal, ProposalTemplate } from '@/lib/api/types';
import { adminListUsers } from '@/lib/api/users';
import { madridToday, toDateInput } from '@/lib/format';

/**
 * Create/edit form for a proposal (drafts only). The client is chosen when it is created; the
 * project, optional, must be one of theirs (the API checks it).
 */
export async function ProposalForm({
  locale,
  action,
  proposal,
  clientId,
  template,
}: {
  locale: AppLocale;
  action: FormAction;
  proposal?: Proposal;
  /** Preselected client on a new proposal (`?client=`). */
  clientId?: string;
  /** What a new proposal starts from (`?template=`). */
  template?: ProposalTemplate;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.proposals' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const previewLabels = await markdownPreviewLabels(locale);

  const [clients, projects] = await Promise.all([
    proposal
      ? Promise.resolve([])
      : adminListUsers({ role: 'CLIENT', accounts: true, pageSize: 100 }).then((r) => r.items),
    adminListProjects({ pageSize: 100 }).then((r) => r.items),
  ]);
  if (!proposal && clients.length === 0) return <Alert>{t('noClients')}</Alert>;
  // A template's validity counts from today (Madrid).
  const templateValidUntil = template?.validDays
    ? new Date(Date.parse(`${madridToday()}T12:00:00Z`) + template.validDays * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : '';
  const projectOptions = projects
    .filter((project) => !proposal || project.client.id === proposal.client.id)
    .map((project) => ({
      value: project.id,
      label: proposal ? project.name : `${project.name} — ${project.client.name}`,
    }));

  return (
    <ActionForm action={action} className={styles.form}>
      {proposal ? null : (
        <FormSelect
          name="clientId"
          label={t('client')}
          placeholder={t('clientPlaceholder')}
          options={clients.map((client) => ({
            value: client.id,
            label: `${client.name} (${client.email})`,
          }))}
          required
          defaultValue={clients.some((client) => client.id === clientId) ? clientId : ''}
        />
      )}
      <FormInput
        name="title"
        label={t('titleLabel')}
        hint={t('titleHint')}
        required
        maxLength={200}
        defaultValue={proposal?.title ?? template?.title}
      />
      <div className={styles.row}>
        <FormSelect
          name="projectId"
          label={t('project')}
          optionalLabel={tc('optional')}
          hint={proposal ? undefined : t('projectHint')}
          placeholder={t('noProject')}
          options={projectOptions}
          defaultValue={proposal?.project?.id ?? ''}
        />
        <FormInput
          name="validUntil"
          type="date"
          label={t('validUntil')}
          optionalLabel={tc('optional')}
          hint={t('validUntilHint')}
          defaultValue={proposal ? toDateInput(proposal.validUntil) : templateValidUntil}
        />
      </div>
      <MarkdownField
        name="summary"
        label={t('summary')}
        hint={t('summaryHint')}
        rows={10}
        required
        defaultValue={proposal?.summary ?? template?.summary ?? ''}
        previewLabels={previewLabels}
      />
      <ProposalItemsField
        initial={proposal?.items ?? template?.items ?? []}
        currency={proposal?.currency ?? 'EUR'}
        locale={locale}
        labels={{
          legend: t('items'),
          hint: t('itemsHint'),
          description: t('itemDescription'),
          quantity: t('itemQuantity'),
          unitPrice: t('itemPrice'),
          amount: t('itemAmount'),
          add: t('addItem'),
          remove: t('removeItem', { n: '{n}' }),
          line: t('line', { n: '{n}' }),
          total: t('total'),
        }}
      />
      <MarkdownField
        name="terms"
        label={t('terms')}
        optionalLabel={tc('optional')}
        hint={t('termsHint')}
        rows={6}
        defaultValue={proposal?.terms ?? template?.terms ?? ''}
        compact
        previewLabels={previewLabels}
      />
      <div className={styles.actions}>
        <SubmitButton pendingLabel={proposal ? tc('saving') : tc('creating')}>
          {proposal ? tc('save') : t('createDraft')}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
