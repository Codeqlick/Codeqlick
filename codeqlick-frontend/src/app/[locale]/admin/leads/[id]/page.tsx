import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetLead } from '@/lib/api/leads';
import { LEAD_STATUSES, type Lead } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { BUDGET_VALUES, type BudgetValue } from '@/lib/schemas/contact';
import { updateLeadAction } from '../actions';

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

  let lead: Lead;
  try {
    lead = await adminGetLead(id);
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
          <Button href={`mailto:${lead.email}`} variant="outline" size="sm">
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

      <section className={styles.panel}>
        <ActionForm action={updateLeadAction.bind(null, locale, lead.id)} className={styles.form}>
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
