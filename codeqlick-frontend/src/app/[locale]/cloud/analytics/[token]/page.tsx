import { PageHeader } from '@/components/ui/PageHeader';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getSharedAnalytics, type CloudAnalyticsPeriod } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import styles from '../../cloud.module.css';
import { ANALYTICS_PERIODS, AnalyticsReport } from '../../console/[team]/[project]/AnalyticsReport';

type PageProps = {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ period?: string }>;
};

const periodOf = (value: string | undefined): CloudAnalyticsPeriod =>
  ANALYTICS_PERIODS.find((key) => key === value) ?? '7d';

const load = cache(async (token: string, period: CloudAnalyticsPeriod) => {
  if (!/^cqa_[A-Za-z0-9_-]{32}$/.test(token)) notFound();
  try {
    return await getSharedAnalytics(token, period);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { locale: raw, token } = await params;
  const locale = resolveLocale(raw);
  const shared = await load(token, periodOf((await searchParams).period));
  const t = await getTranslations({ locale, namespace: 'Cloud.analytics.shared' });
  return {
    title: { absolute: `${shared.project.name} · ${t('suffix')}` },
    alternates: {},
    openGraph: { title: `${shared.project.name} · ${t('suffix')}`, url: undefined },
    robots: { index: false, follow: false },
  };
}

/** A project's analytics through its public, read-only link (architecture 4.13, "Shared link"). */
export default async function SharedAnalyticsPage({ params, searchParams }: PageProps) {
  const { locale: raw, token } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const period = periodOf((await searchParams).period);
  const t = await getTranslations({ locale, namespace: 'Cloud.analytics.shared' });
  const shared = await load(token, period);

  return (
    <div className={`${styles.landing} ${styles.docs}`}>
      <PageHeader title={shared.project.name} lead={t('lead')} />
      <AnalyticsReport
        locale={locale}
        report={shared}
        period={period}
        periodHref={(key) => `/cloud/analytics/${token}?period=${key}`}
      />
      <p className={styles.small}>
        <Link href="/cloud">{t('by')}</Link>
      </p>
    </div>
  );
}
