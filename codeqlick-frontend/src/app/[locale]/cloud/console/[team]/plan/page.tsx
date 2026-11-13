import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudBilling, getCloudTeam } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatBytes, formatWhen } from '@/lib/cloud';
import { billingAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type PageProps = {
  params: Promise<{ locale: string; team: string }>;
  searchParams: Promise<{ billing?: string }>;
};

/** The limits shown side by side, in this order; bytes are formatted as sizes. */
const ROWS = [
  'projectsPerTeam',
  'storageBytesPerTeam',
  'deploymentBytes',
  'membersPerTeam',
  'domainsPerProject',
  'buildsPerMonth',
  'buildMinutes',
  'formSubmissionsPerMonth',
  'monitorsPerTeam',
  'analyticsEventsPerMonth',
  'kvKeysPerProject',
  'kvBytesPerProject',
] as const;
const BYTES = new Set<string>(['storageBytesPerTeam', 'deploymentBytes', 'kvBytesPerProject']);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.plan' });
  return { title: t('title') };
}

/** A team's plan and its PRO subscription (architecture 4.13 "Plans and billing"). */
export default async function CloudPlanPage({ params, searchParams }: PageProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const { billing: notice } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  let data;
  try {
    data = await Promise.all([getCloudTeam(slug), getCloudBilling(slug)]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const [team, billing] = data;
  const owner = team.role === 'OWNER';
  const number = new Intl.NumberFormat(locale);
  const value = (key: string, plan: 'FREE' | 'PRO') => {
    const amount = billing.limits[plan][key] ?? 0;
    return BYTES.has(key) ? formatBytes(amount, locale) : number.format(amount);
  };
  const price = billing.price
    ? new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: billing.price.currency.toUpperCase(),
      }).format(billing.price.amount / 100)
    : null;
  const sub = billing.subscription;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}`}>← {team.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>
          {t('plan.title')}{' '}
          <Badge tone={billing.plan === 'PRO' ? 'brand' : 'neutral'}>{billing.plan}</Badge>
        </h1>
        <p className={styles.muted}>{t('plan.lead')}</p>
      </div>

      {notice === 'done' ? <Alert tone="success">{t('plan.done')}</Alert> : null}
      {notice === 'canceled' ? <Alert tone="info">{t('plan.canceled')}</Alert> : null}
      {notice === 'error' ? <Alert tone="error">{t('plan.error')}</Alert> : null}

      <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="sub-title">
        <h2 id="sub-title" className={styles.cardTitle}>
          {billing.plan === 'PRO' ? t('plan.proTitle') : t('plan.freeTitle')}
        </h2>
        {price ? <p>{t('plan.price', { price, vat: billing.price!.vatPercent })}</p> : null}
        {sub ? (
          <p className={styles.small}>
            {t(
              `plan.status.${sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due' || sub.status === 'canceled' ? sub.status : 'other'}`,
            )}
            {sub.currentPeriodEnd && sub.status !== 'canceled'
              ? ` · ${t(sub.cancelAtPeriodEnd ? 'plan.endsOn' : 'plan.renewsOn', {
                  date: formatWhen(sub.currentPeriodEnd, locale),
                })}`
              : ''}
          </p>
        ) : null}
        {!billing.available ? (
          <p className={styles.muted}>{t('plan.unavailable')}</p>
        ) : owner ? (
          <form action={billingAction} className={styles.actions}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="team" value={team.slug} />
            {billing.plan === 'FREE' ? (
              <>
                <input type="hidden" name="kind" value="checkout" />
                <SubmitButton pendingLabel={t('plan.opening')}>{t('plan.upgrade')}</SubmitButton>
              </>
            ) : (
              <>
                <input type="hidden" name="kind" value="portal" />
                <SubmitButton variant="outline" pendingLabel={t('plan.opening')}>
                  {t('plan.manage')}
                </SubmitButton>
              </>
            )}
          </form>
        ) : (
          <p className={styles.small}>{t('plan.ownersOnly')}</p>
        )}
        <p className={styles.small}>{t('plan.downgrade')}</p>
      </section>

      <div className={styles.dnsWrap}>
        <table className={styles.top}>
          <caption>{t('plan.compare')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('plan.limit')}</th>
              <th scope="col">{t('plan.free')}</th>
              <th scope="col">PRO</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((key) => (
              <tr key={key}>
                <td>{t(`plan.limits.${key}`)}</td>
                <td>{value(key, 'FREE')}</td>
                <td>{value(key, 'PRO')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
