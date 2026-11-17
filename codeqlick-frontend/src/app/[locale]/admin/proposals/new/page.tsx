import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { resolveLocale } from '@/i18n/locale';
import { adminListProposalTemplates } from '@/lib/api/proposals';
import { firstParam } from '@/lib/format';
import { createProposalAction } from '../actions';
import { ProposalForm } from '../ProposalForm';

export default async function NewProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ client?: string | string[]; template?: string | string[] }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.proposals' });
  const query = await searchParams;
  const clientId = firstParam(query.client);
  const templates = await adminListProposalTemplates();
  const template = templates.find((item) => item.id === firstParam(query.template));
  const href = (templateId?: string) => ({
    pathname: '/admin/proposals/new',
    query: {
      ...(clientId ? { client: clientId } : {}),
      ...(templateId ? { template: templateId } : {}),
    },
  });

  return (
    <div className={styles.stack}>
      <PageHeader title={t('new')} back={{ href: '/admin/proposals', label: t('back') }} />
      {templates.length > 0 ? (
        <div className={styles.panel}>
          <p className={styles.muted}>{t('startFrom')}</p>
          <Tabs
            variant="pills"
            label={t('templates')}
            items={[
              { key: 'blank', href: href(), label: t('blank'), current: !template },
              ...templates.map((item) => ({
                key: item.id,
                href: href(item.id),
                label: item.name,
                current: item.id === template?.id,
              })),
            ]}
          />
        </div>
      ) : null}
      <section className={styles.panel}>
        {template ? (
          <p className={styles.muted}>{t('fromTemplate', { name: template.name })}</p>
        ) : null}
        <ProposalForm
          key={template?.id ?? 'blank'}
          template={template}
          locale={locale}
          action={createProposalAction.bind(null, locale)}
          clientId={clientId}
        />
      </section>
    </div>
  );
}
