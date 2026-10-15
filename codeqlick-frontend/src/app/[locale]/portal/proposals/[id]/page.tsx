import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { PrintButton } from '@/components/app/PrintButton';
import { ProposalDocument } from '@/components/app/ProposalDocument';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMyProposal } from '@/lib/api/proposals';
import type { Proposal } from '@/lib/api/types';
import { getCurrentUser } from '@/lib/auth/session';
import { formatDate, formatMoney } from '@/lib/format';
import { acceptProposalAction, declineProposalAction } from '../actions';

export default async function PortalProposalPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Proposals' });

  let proposal: Proposal;
  try {
    proposal = await getMyProposal(id);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const user = await getCurrentUser();
  // Answering is the client's call; admins looking at the portal only read.
  const canAnswer = user?.role === 'CLIENT' && proposal.status === 'SENT' && !proposal.expired;
  const total = formatMoney(proposal.total, proposal.currency, locale);

  let notice: { tone: 'success' | 'info' | 'error'; text: string } | undefined;
  if (proposal.status === 'ACCEPTED') {
    notice = {
      tone: 'success',
      text: t('acceptedNotice', { date: formatDate(proposal.respondedAt, locale) }),
    };
  } else if (proposal.status === 'DECLINED') {
    notice = { tone: 'info', text: t('declinedNotice') };
  } else if (proposal.status === 'WITHDRAWN') {
    notice = { tone: 'info', text: t('withdrawnNotice') };
  } else if (proposal.expired) {
    notice = { tone: 'error', text: t('expiredNotice') };
  }

  return (
    <div className={styles.stack}>
      <div data-print="hide">
        <PageHeader
          title={proposal.title}
          back={{ href: '/portal/proposals', label: t('back') }}
          actions={<PrintButton label={t('print')} />}
        />
      </div>

      {notice ? (
        <div data-print="hide">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}

      <ProposalDocument proposal={proposal} locale={locale} />

      {canAnswer ? (
        <div className={styles.stack} data-print="hide">
          <section className={styles.panel} aria-labelledby="accept-heading">
            <h2 id="accept-heading" className={styles.panelTitle}>
              {t('acceptTitle')}
            </h2>
            <ActionForm
              action={acceptProposalAction.bind(null, locale, proposal.id)}
              className={styles.form}
            >
              <p className={styles.muted}>{t('acceptBody', { total })}</p>
              <FormInput
                name="name"
                label={t('acceptName')}
                hint={t('acceptNameHint')}
                autoComplete="name"
                required
              />
              <FormCheckbox name="confirm" label={t('acceptConfirm', { total })} required />
              <div className={styles.actions}>
                <SubmitButton pendingLabel={t('accepting')}>{t('accept')}</SubmitButton>
              </div>
            </ActionForm>
          </section>
          <section className={styles.panel}>
            <details className={styles.commentForm}>
              <summary>{t('declineTitle')}</summary>
              <ActionForm
                action={declineProposalAction.bind(null, locale, proposal.id)}
                className={styles.form}
              >
                <FormTextarea
                  name="reason"
                  label={t('declineReason')}
                  hint={t('declineReasonHint')}
                  rows={3}
                />
                <div className={styles.actions}>
                  <SubmitButton variant="outline" pendingLabel={t('declining')}>
                    {t('decline')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </details>
          </section>
        </div>
      ) : null}
    </div>
  );
}
