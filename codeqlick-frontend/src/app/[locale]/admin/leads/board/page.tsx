import { getTranslations } from 'next-intl/server';
import { LeadBoard } from '@/components/app/LeadBoard';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { adminListLeads } from '@/lib/api/leads';
import type { LeadStatus } from '@/lib/api/types';
import { BUDGET_VALUES } from '@/lib/contact-options';
import { moveLeadAction } from './actions';

/** The pipeline: archived leads stay in the list only. */
const COLUMNS = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'] as const satisfies LeadStatus[];

export default async function LeadBoardPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.leads' });
  const ts = await getTranslations({ locale, namespace: 'LeadStatuses' });
  const tb = await getTranslations({ locale, namespace: 'Contact.budgets' });

  // The 50 most recent per column; the header says when there are more.
  const pages = await Promise.all(
    COLUMNS.map((status) => adminListLeads({ status, pageSize: 50 })),
  );

  return (
    <>
      <PageHeader
        title={t('boardTitle')}
        lead={t('boardLead')}
        actions={
          <Button href="/admin/leads" variant="outline" size="sm">
            {t('viewList')}
          </Button>
        }
      />
      <LeadBoard
        columns={COLUMNS}
        leads={pages.flatMap((page) => page.items)}
        totals={Object.fromEntries(
          COLUMNS.map((status, index) => [status, pages[index]?.total ?? 0]),
        )}
        locale={locale}
        move={moveLeadAction.bind(null, locale)}
        labels={{
          statuses: Object.fromEntries(COLUMNS.map((status) => [status, ts(status)])) as Record<
            LeadStatus,
            string
          >,
          budgets: Object.fromEntries(BUDGET_VALUES.map((value) => [value, tb(value)])),
          hints: Object.fromEntries(COLUMNS.map((status) => [status, t(`boardHints.${status}`)])),
          moveTo: t('moveTo'),
          empty: t('boardEmpty'),
          estimate: t('boardEstimate'),
          estimateHint: t('boardEstimateHint'),
          failed: t('boardFailed'),
          more: t('boardMore', { count: '{count}' }),
        }}
      />
    </>
  );
}
