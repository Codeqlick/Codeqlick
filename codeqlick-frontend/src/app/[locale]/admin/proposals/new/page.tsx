import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { resolveLocale } from '@/i18n/locale';
import { firstParam } from '@/lib/format';
import { createProposalAction } from '../actions';
import { ProposalForm } from '../ProposalForm';

export default async function NewProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ client?: string | string[] }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.proposals' });

  return (
    <>
      <PageHeader title={t('new')} back={{ href: '/admin/proposals', label: t('back') }} />
      <section className={styles.panel}>
        <ProposalForm
          locale={locale}
          action={createProposalAction.bind(null, locale)}
          clientId={firstParam((await searchParams).client)}
        />
      </section>
    </>
  );
}
