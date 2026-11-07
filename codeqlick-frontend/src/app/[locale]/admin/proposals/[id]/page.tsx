import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { PrintButton } from '@/components/app/PrintButton';
import { ProposalDocument } from '@/components/app/ProposalDocument';
import { ProposalStatusBadge } from '@/components/app/StatusBadges';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetProposal } from '@/lib/api/proposals';
import type { Proposal } from '@/lib/api/types';
import { firstParam, formatDateTime } from '@/lib/format';
import { Alert } from '@/components/ui/Alert';
import {
  deleteProposalAction,
  duplicateProposalAction,
  sendProposalAction,
  updateProposalAction,
  withdrawProposalAction,
} from '../actions';
import { saveAsTemplateAction } from '../template-actions';
import { ProposalForm } from '../ProposalForm';

export default async function AdminProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ sent?: string | string[] }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.proposals' });
  const tp = await getTranslations({ locale, namespace: 'Proposals' });
  const ts = await getTranslations({ locale, namespace: 'Proposals.statuses' });

  let proposal: Proposal;
  try {
    proposal = await adminGetProposal(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const draft = proposal.status === 'DRAFT';
  const sent = firstParam((await searchParams).sent);

  const duplicate = (
    <ActionForm action={duplicateProposalAction.bind(null, locale, proposal.id)}>
      <SubmitButton variant="outline" size="sm" pendingLabel={t('duplicating')}>
        {t('duplicate')}
      </SubmitButton>
    </ActionForm>
  );

  return (
    <div className={styles.stack}>
      <div data-print="hide">
        <PageHeader
          title={`#${proposal.number} ${proposal.title}`}
          back={{ href: '/admin/proposals', label: t('back') }}
          actions={<PrintButton label={tp('print')} />}
        />
      </div>

      {sent && proposal.status === 'SENT' ? (
        <div data-print="hide">
          <Alert tone={sent === 'email' ? 'success' : 'error'}>
            {sent === 'email' ? t('sent') : t('sentNoEmail')}
          </Alert>
        </div>
      ) : null}

      <section className={styles.panel} data-print="hide">
        <dl className={styles.facts}>
          <div>
            <dt>{t('status')}</dt>
            <dd>
              <ProposalStatusBadge
                status={proposal.status}
                expired={proposal.expired}
                label={proposal.expired ? tp('expired') : ts(proposal.status)}
              />
            </dd>
          </div>
          <div>
            <dt>{t('client')}</dt>
            <dd>
              <Link href={`/admin/users/${proposal.client.id}`}>{proposal.client.name}</Link>
              <span className={styles.sub}>{proposal.client.email}</span>
            </dd>
          </div>
          {proposal.sentAt ? (
            <div>
              <dt>{t('sentAt')}</dt>
              <dd>{formatDateTime(proposal.sentAt, locale)}</dd>
            </div>
          ) : null}
          {proposal.respondedAt ? (
            <div>
              <dt>{t('respondedAt')}</dt>
              <dd>{formatDateTime(proposal.respondedAt, locale)}</dd>
            </div>
          ) : null}
          {proposal.acceptedName ? (
            <div>
              <dt>{t('acceptedName')}</dt>
              <dd>{proposal.acceptedName}</dd>
            </div>
          ) : null}
        </dl>
        {proposal.declineReason ? (
          <p className={styles.prewrap}>
            <strong>{t('declineReason')}:</strong> {proposal.declineReason}
          </p>
        ) : null}
      </section>

      {draft ? (
        <>
          <section className={styles.panel} data-print="hide">
            <h2 className={styles.panelTitle}>{t('sendTitle')}</h2>
            <ActionForm
              action={sendProposalAction.bind(null, locale, proposal.id)}
              className={styles.form}
            >
              <p className={styles.muted}>{t('sendBody', { email: proposal.client.email })}</p>
              <div className={styles.actions}>
                <SubmitButton pendingLabel={t('sending')}>{t('send')}</SubmitButton>
              </div>
            </ActionForm>
          </section>
          <section className={styles.panel} data-print="hide">
            <h2 className={styles.panelTitle}>{t('edit')}</h2>
            <ProposalForm
              locale={locale}
              action={updateProposalAction.bind(null, locale, proposal.id)}
              proposal={proposal}
            />
          </section>
          <h2 className={styles.panelTitle} data-print="hide">
            {t('preview')}
          </h2>
        </>
      ) : (
        <section className={styles.panel} data-print="hide">
          <h2 className={styles.panelTitle}>{t('nextVersionTitle')}</h2>
          <p className={styles.muted}>{t('nextVersionBody')}</p>
          <div className={styles.actions}>
            {proposal.status === 'SENT' ? (
              <ActionForm action={withdrawProposalAction.bind(null, locale, proposal.id)}>
                <SubmitButton variant="outline" size="sm" pendingLabel={t('withdrawing')}>
                  {t('withdraw')}
                </SubmitButton>
              </ActionForm>
            ) : null}
            {duplicate}
          </div>
        </section>
      )}

      <ProposalDocument proposal={proposal} locale={locale} />

      <section className={styles.panel} data-print="hide" aria-labelledby="template-heading">
        <h2 id="template-heading" className={styles.panelTitle}>
          {t('saveAsTemplate')}
        </h2>
        <ActionForm
          action={saveAsTemplateAction.bind(null, locale, proposal.id)}
          className={styles.form}
        >
          <p className={styles.muted}>{t('saveAsTemplateLead')}</p>
          <FormInput
            id="template-name"
            name="name"
            label={t('templateName')}
            placeholder={t('templateNamePlaceholder')}
            maxLength={80}
            required
          />
          <div className={styles.actions}>
            <SubmitButton variant="outline" size="sm" pendingLabel={t('savingTemplate')}>
              {t('saveAsTemplate')}
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

      {draft ? (
        <div data-print="hide">
          <DeleteForm
            action={deleteProposalAction.bind(null, locale, proposal.id)}
            title={t('deleteTitle')}
            body={t('deleteBody')}
          />
        </div>
      ) : null}
    </div>
  );
}
