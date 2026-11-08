import { getTranslations } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { Invoice, InvoiceStatus } from '@/lib/api/invoices';
import { formatDate, formatMoney } from '@/lib/format';
import { ActionForm, FormCheckbox, type FormAction } from './ActionForm';
import styles from './app.module.css';

const TONE: Record<InvoiceStatus, BadgeTone> = {
  PAID: 'success',
  DUE: 'warning',
  OVERDUE: 'danger',
};

/**
 * Invoices as a table, each with its PDF: the team's through `/portal/invoices/:id`, Stripe's
 * through `/portal/invoices/stripe/:purchaseId`. The admin page passes the actions to mark them
 * paid and delete them.
 */
export async function InvoiceList({
  invoices,
  locale,
  showProject = false,
  paidAction,
  deleteAction,
}: {
  invoices: Invoice[];
  locale: AppLocale;
  showProject?: boolean;
  paidAction?: (invoice: Invoice) => FormAction;
  deleteAction?: (invoice: Invoice) => FormAction;
}) {
  const t = await getTranslations({ locale, namespace: 'Invoices' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const pdfHref = (invoice: Invoice) =>
    invoice.source === 'stripe'
      ? `/${locale}/portal/invoices/stripe/${invoice.id}`
      : `/${locale}/portal/invoices/${invoice.id}`;

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('invoice')}</th>
            <th scope="col">{t('date')}</th>
            <th scope="col">{t('amount')}</th>
            <th scope="col">{t('status')}</th>
            <th scope="col">
              <span className="visually-hidden">{t('pdf')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={`${invoice.source}-${invoice.id}`}>
              <th scope="row">
                {invoice.source === 'stripe' ? t('stripeInvoice') : invoice.number}
                {showProject && invoice.project ? (
                  <span className={styles.sub}>{invoice.project.name}</span>
                ) : null}
              </th>
              <td>
                {formatDate(invoice.issuedOn, locale)}
                {invoice.dueOn && invoice.status !== 'PAID' ? (
                  <span className={styles.sub}>
                    {t('dueOn', { date: formatDate(invoice.dueOn, locale) })}
                  </span>
                ) : null}
              </td>
              <td>{formatMoney(invoice.amountCents, invoice.currency, locale)}</td>
              <td>
                <Badge tone={TONE[invoice.status]}>{t(`statuses.${invoice.status}`)}</Badge>
              </td>
              <td>
                {/* Route handlers, not pages: plain links. */}
                <a href={pdfHref(invoice)}>{t('download')}</a>
                {paidAction && invoice.source === 'team' ? (
                  <ActionForm action={paidAction(invoice)} className={styles.fileDelete}>
                    <SubmitButton variant="ghost" size="sm" pendingLabel={tc('saving')}>
                      {invoice.status === 'PAID' ? t('markUnpaid') : t('markPaid')}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
                {deleteAction && invoice.source === 'team' ? (
                  <details>
                    <summary>{tc('delete')}</summary>
                    <ActionForm action={deleteAction(invoice)} className={styles.fileDelete}>
                      <p className={styles.muted}>{t('deleteHint')}</p>
                      <FormCheckbox
                        id={`confirm-invoice-${invoice.id}`}
                        name="confirm"
                        label={tc('confirmDelete')}
                        required
                      />
                      <SubmitButton variant="danger" size="sm" pendingLabel={tc('deleting')}>
                        {tc('delete')}
                      </SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
