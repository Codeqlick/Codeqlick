import { getTranslations } from 'next-intl/server';
import { InvoiceList } from '@/components/app/InvoiceList';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { resolveLocale } from '@/i18n/locale';
import { listMyInvoices } from '@/lib/api/invoices';

type PageProps = { params: Promise<{ locale: string }> };

/** Every invoice of the client: the team's and Stripe's (architecture 5, decision 23). */
export default async function PortalInvoicesPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Invoices' });
  const invoices = await listMyInvoices();

  return (
    <>
      <PageHeader title={t('title')} lead={t('lead')} />
      {invoices.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <InvoiceList invoices={invoices} locale={locale} showProject />
      )}
    </>
  );
}
