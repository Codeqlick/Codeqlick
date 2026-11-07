import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { SiteRequestFields } from '@/components/app/SiteRequestFields';
import { SavedReplyPicker } from '@/components/app/SavedReplyPicker';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetLead, adminListLeadPurchases, adminListLeadReplies } from '@/lib/api/leads';
import { adminListSavedReplies } from '@/lib/api/saved-replies';
import {
  LEAD_STATUSES,
  LOST_REASONS,
  type Lead,
  type LeadReply,
  type SitePurchase,
} from '@/lib/api/types';
import { Link } from '@/i18n/navigation';
import { formatDateTime } from '@/lib/format';
import {
  BUDGET_VALUES,
  PROJECT_TYPES,
  type BudgetValue,
  type ProjectType,
} from '@/lib/schemas/contact';
import {
  convertLeadAction,
  deleteLeadAction,
  editLeadRequestAction,
  proposeFromRequestAction,
  rebuildLeadPreviewAction,
  removeLeadPreviewAction,
  replyToLeadAction,
  updateLeadAction,
  updateLeadContactAction,
} from '../actions';

const PURCHASE_TONES = { PENDING: 'warning', PAID: 'success', EXPIRED: 'neutral' } as const;

const PREVIEW_TONES = {
  BUILDING: 'warning',
  READY: 'success',
  FAILED: 'danger',
  REMOVED: 'neutral',
} as const;

export default async function AdminLeadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.leads' });
  const tsite = await getTranslations({ locale, namespace: 'Admin.sites' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const ts = await getTranslations({ locale, namespace: 'LeadStatuses' });
  const tb = await getTranslations({ locale, namespace: 'Contact.budgets' });
  const tpt = await getTranslations({ locale, namespace: 'Contact.projectTypes' });
  const tl = await getTranslations({ locale, namespace: 'LocaleSwitcher' });
  const tr = await getTranslations({ locale, namespace: 'LostReasons' });
  const tsr = await getTranslations({ locale, namespace: 'Admin.savedReplies' });
  // Optional: the reply box works without them.
  const savedReplies = await adminListSavedReplies().catch(() => []);

  let lead: Lead;
  let replies: LeadReply[];
  let purchases: SitePurchase[];
  try {
    [lead, replies, purchases] = await Promise.all([
      adminGetLead(id),
      adminListLeadReplies(id),
      adminListLeadPurchases(id),
    ]);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  const knownType = PROJECT_TYPES.find((value) => value === lead.projectType) as
    ProjectType | undefined;
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
              {lead.email ? (
                <a href={`mailto:${lead.email}`}>{lead.email}</a>
              ) : (
                <span className={styles.muted}>{t('noEmail')}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>{t('company')}</dt>
            <dd>{lead.company ?? tc('none')}</dd>
          </div>
          <div>
            <dt>{t('projectType')}</dt>
            <dd>{knownType ? tpt(knownType) : (lead.projectType ?? tc('none'))}</dd>
          </div>
          {/* Only older leads have one: the form asked for a budget before. */}
          {lead.budget ? (
            <div>
              <dt>{t('budget')}</dt>
              <dd>{knownBudget ? tb(knownBudget) : lead.budget}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('locale')}</dt>
            <dd>{tl(lead.locale)}</dd>
          </div>
          <div>
            <dt>{lead.prospect ? t('added') : t('received')}</dt>
            <dd>
              {formatDateTime(lead.createdAt, locale)}
              {lead.prospect ? (
                <>
                  {' '}
                  <Badge tone="neutral">{t('prospect')}</Badge>
                </>
              ) : null}
            </dd>
          </div>
        </dl>
        <details>
          <summary>{t('contactEdit')}</summary>
          <ActionForm
            key={`contact-${lead.updatedAt}`}
            action={updateLeadContactAction.bind(null, locale, lead.id)}
            className={styles.form}
          >
            <div className={styles.row}>
              <FormInput
                id="contact-name"
                name="name"
                label={t('name')}
                defaultValue={lead.name}
                required
                maxLength={120}
              />
              <FormInput
                id="contact-email"
                name="email"
                type="email"
                label={t('email')}
                hint={lead.prospect ? t('emailProspectHint') : undefined}
                defaultValue={lead.email ?? ''}
                required={!lead.prospect}
                maxLength={254}
              />
              <FormInput
                id="contact-company"
                name="company"
                label={t('company')}
                optionalLabel={tc('optional')}
                defaultValue={lead.company ?? ''}
                maxLength={160}
              />
            </div>
            <div className={styles.actions}>
              <SubmitButton size="sm" pendingLabel={tc('saving')}>
                {tc('save')}
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      </section>

      {lead.preview || lead.siteRequest ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('previewTitle')}</h2>
          {lead.preview ? (
            <p>
              <Badge tone={PREVIEW_TONES[lead.preview.status]}>
                {t(`previewStatuses.${lead.preview.status}`)}
              </Badge>{' '}
              {lead.preview.status === 'READY' ? (
                <a href={lead.preview.url} target="_blank" rel="noopener noreferrer">
                  {lead.preview.url}
                </a>
              ) : null}
            </p>
          ) : (
            <p className={styles.muted}>{t('previewNone')}</p>
          )}
          {lead.preview?.followUpAt ? (
            <p className={styles.muted}>
              {t('previewFollowUp', { date: formatDateTime(lead.preview.followUpAt, locale) })}
            </p>
          ) : null}
          {lead.prospect ? <p className={styles.muted}>{t('previewProspect')}</p> : null}
          <div className={styles.actions}>
            {lead.siteRequest ? (
              <ActionForm action={rebuildLeadPreviewAction.bind(null, locale, lead.id)}>
                <SubmitButton variant="outline" size="sm" pendingLabel={t('previewRebuilding')}>
                  {lead.preview && lead.preview.status !== 'REMOVED'
                    ? t('previewRebuild')
                    : t('previewBuild')}
                </SubmitButton>
              </ActionForm>
            ) : null}
            {lead.preview && lead.preview.status !== 'REMOVED' ? (
              <ActionForm action={removeLeadPreviewAction.bind(null, locale, lead.id)}>
                <SubmitButton variant="outline" size="sm" pendingLabel={t('previewRemoving')}>
                  {t('previewRemove')}
                </SubmitButton>
              </ActionForm>
            ) : null}
          </div>
          {lead.siteRequest ? (
            <details>
              <summary>{t('requestEdit')}</summary>
              <ActionForm
                key={`request-${lead.updatedAt}`}
                action={editLeadRequestAction.bind(null, locale, lead.id)}
                className={styles.form}
              >
                <p className={styles.muted}>{t('requestEditBody')}</p>
                <SiteRequestFields locale={locale} request={lead.siteRequest} />
                <div className={styles.actions}>
                  <SubmitButton size="sm" pendingLabel={t('requestSaving')}>
                    {t('requestSave')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </details>
          ) : null}
        </section>
      ) : null}

      {purchases.length > 0 ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('purchasesTitle')}</h2>
          {purchases.map((purchase) => (
            <div key={purchase.id} className={styles.form}>
              <p>
                <Badge tone={PURCHASE_TONES[purchase.status]}>
                  {t(`purchaseStatuses.${purchase.status}`)}
                </Badge>{' '}
                {t('purchaseLine', {
                  amount: new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: purchase.currency.toUpperCase(),
                  }).format(purchase.amountCents / 100),
                  date: formatDateTime(purchase.paidAt ?? purchase.createdAt, locale),
                })}
              </p>
              {purchase.email ? (
                <p className={styles.muted}>{t('purchaseBuyer', { email: purchase.email })}</p>
              ) : null}
              <p className={styles.muted}>
                {t('purchaseSession', { id: purchase.stripeSessionId })}
              </p>
              {purchase.error ? (
                <p className={styles.muted}>{t('purchaseError', { error: purchase.error })}</p>
              ) : null}
              {purchase.stripeInvoiceId ? (
                <p>
                  <a
                    href={`https://dashboard.stripe.com/invoices/${encodeURIComponent(purchase.stripeInvoiceId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('purchaseInvoice')}
                  </a>
                </p>
              ) : null}
              {purchase.projectId ? (
                <p>
                  <Link href={`/admin/projects/${purchase.projectId}`}>{t('purchaseProject')}</Link>
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {lead.siteRequest && (lead.proposalId || (!lead.clientId && lead.status !== 'SPAM')) ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('proposalTitle')}</h2>
          {lead.proposalId ? (
            <p>
              <Link href={`/admin/proposals/${lead.proposalId}`}>{t('proposalOpen')}</Link>
            </p>
          ) : !lead.email ? (
            <p className={styles.muted}>{t('proposalNoEmail')}</p>
          ) : (
            <ActionForm action={proposeFromRequestAction.bind(null, locale, lead.id)}>
              <p className={styles.muted}>{t('proposalBody')}</p>
              <div className={styles.actions}>
                <SubmitButton size="sm" pendingLabel={t('proposalCreating')}>
                  {t('proposalCreate')}
                </SubmitButton>
              </div>
            </ActionForm>
          )}
        </section>
      ) : null}

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
          {lead.email ? (
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
          ) : (
            <p className={styles.muted}>{t('replyNoEmail')}</p>
          )}
        </div>
      </section>

      <section className={styles.panel}>
        {/* Keyed by status: a first reply moves NEW to TALKING, and the select must show it. */}
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
          <div className={styles.row}>
            <FormSelect
              name="lostReason"
              label={t('lostReason')}
              hint={t('lostReasonHint')}
              placeholder={t('noReason')}
              options={LOST_REASONS.map((value) => ({ value, label: tr(value) }))}
              defaultValue={lead.lostReason ?? ''}
            />
            <FormInput
              name="followUpOn"
              type="date"
              label={t('followUpOn')}
              optionalLabel={tc('optional')}
              hint={t('followUpOnHint')}
              defaultValue={lead.followUpOn ?? ''}
            />
          </div>
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

      {lead.clientId ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('convertedTitle')}</h2>
          <p className={styles.muted}>{t('convertedBody')}</p>
          <p>
            <Link href={`/admin/users/${lead.clientId}`}>{t('viewClient')}</Link>
          </p>
        </section>
      ) : lead.status !== 'SPAM' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('convertTitle')}</h2>
          <ActionForm
            action={convertLeadAction.bind(null, locale, lead.id)}
            className={styles.form}
          >
            <p className={styles.muted}>{lead.email ? t('convertBody') : t('convertNoEmail')}</p>
            <FormInput
              name="projectName"
              label={t('projectName')}
              defaultValue={lead.company ?? lead.name}
              required
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('converting')}>{t('convert')}</SubmitButton>
            </div>
          </ActionForm>
          <p className={styles.muted}>{tsite('leadHint')}</p>
          <p>
            <Link href={{ pathname: '/admin/sites/new', query: { lead: lead.id } }}>
              {tsite('leadButton')}
            </Link>
          </p>
        </section>
      ) : null}

      <DeleteForm
        action={deleteLeadAction.bind(null, locale, lead.id)}
        title={t('deleteTitle')}
        body={
          lead.preview && lead.preview.status !== 'REMOVED'
            ? t('deleteBodyPreview')
            : t('deleteBody')
        }
      />
    </div>
  );
}
