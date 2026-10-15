import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SavedReplyPicker } from '@/components/app/SavedReplyPicker';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetLead, adminListLeadReplies } from '@/lib/api/leads';
import { adminListSavedReplies } from '@/lib/api/saved-replies';
import { LEAD_STATUSES, type Lead, type LeadReply } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { BUDGET_VALUES, type BudgetValue } from '@/lib/schemas/contact';
import { replyToLeadAction, updateLeadAction } from '../actions';

export default async function AdminLeadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.leads' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const ts = await getTranslations({ locale, namespace: 'LeadStatuses' });
  const tb = await getTranslations({ locale, namespace: 'Contact.budgets' });
  const tl = await getTranslations({ locale, namespace: 'LocaleSwitcher' });
  const tsr = await getTranslations({ locale, namespace: 'Admin.savedReplies' });
  // Optional: the reply box works without them.
  const savedReplies = await adminListSavedReplies().catch(() => []);

  let lead: Lead;
  let replies: LeadReply[];
  try {
    [lead, replies] = await Promise.all([adminGetLead(id), adminListLeadReplies(id)]);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  const knownBudget = BUDGET_VALUES.find((value) => value === lead.budget) as
    BudgetValue | undefined;

  return (
    <div className={styles.stack}>
      <PageHeader
        title={lead.name}
        back={{ href: '/admin/leads', label: t('back') }}
        actions={
          <Button href="#reply" variant="outline" size="sm">
            {t('reply')}
          </Button>
        }
      />

      <section className={styles.panel}>
        <dl className={styles.facts}>
          <div>
            <dt>{t('email')}</dt>
            <dd>
              <a href={`mailto:${lead.email}`}>{lead.email}</a>
            </dd>
          </div>
          <div>
            <dt>{t('company')}</dt>
            <dd>{lead.company ?? tc('none')}</dd>
          </div>
          <div>
            <dt>{t('budget')}</dt>
            <dd>{knownBudget ? tb(knownBudget) : (lead.budget ?? tc('none'))}</dd>
          </div>
          <div>
            <dt>{t('locale')}</dt>
            <dd>{tl(lead.locale)}</dd>
          </div>
          <div>
            <dt>{t('received')}</dt>
            <dd>{formatDateTime(lead.createdAt, locale)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('message')}</h2>
        <p className={styles.prewrap}>{lead.message}</p>
      </section>

      <section className={styles.panel} id="reply" aria-labelledby="reply-heading">
        <h2 id="reply-heading" className={styles.panelTitle}>
          {t('replies')}
        </h2>
        <div className={styles.stack}>
          {replies.length > 0 && (
            <ol className={styles.updates}>
              {replies.map((reply) => (
                <li key={reply.id} className={styles.update}>
                  <h3 className={styles.updateTitle}>{reply.subject}</h3>
                  <p className={styles.updateMeta}>
                    {t('repliedBy', {
                      author: reply.author.name,
                      date: formatDateTime(reply.createdAt, locale),
                    })}
                  </p>
                  <p className={styles.prewrap}>{reply.body}</p>
                </li>
              ))}
            </ol>
          )}
          <ActionForm
            action={replyToLeadAction.bind(null, locale, lead.id)}
            className={styles.form}
          >
            <FormInput
              name="subject"
              label={t('replySubject')}
              required
              defaultValue={
                lead.locale === 'es'
                  ? 'Re: tu mensaje a Codeqlick'
                  : 'Re: your message to Codeqlick'
              }
            />
            <SavedReplyPicker
              target="body"
              replies={savedReplies}
              values={{ name: lead.name }}
              label={tsr('insert')}
              placeholder={tsr('insertPlaceholder')}
            />
            <FormTextarea
              name="body"
              label={t('replyBody')}
              hint={t('replyHint', { email: lead.email, language: tl(lead.locale) })}
              rows={10}
              required
              defaultValue={
                lead.locale === 'es' ? `Hola ${lead.name}:\n\n` : `Hi ${lead.name},\n\n`
              }
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('replySending')}>{t('replySend')}</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className={styles.panel}>
        {/* Keyed by status: a first reply moves NEW to CONTACTED, and the select must show it. */}
        <ActionForm
          key={lead.status}
          action={updateLeadAction.bind(null, locale, lead.id)}
          className={styles.form}
        >
          <FormSelect
            name="status"
            label={t('status')}
            options={LEAD_STATUSES.map((value) => ({ value, label: ts(value) }))}
            defaultValue={lead.status}
          />
          <FormTextarea
            name="notes"
            label={t('notes')}
            optionalLabel={tc('optional')}
            rows={5}
            defaultValue={lead.notes ?? ''}
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
