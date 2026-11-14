import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudUsage } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatBytes, usageWarnings } from '@/lib/cloud';
import styles from '../../cloud.module.css';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; team: string }>;
};

/** Every team page: a banner while a limit of the plan is at 80 % or more (architecture 4.13). */
export default async function CloudTeamLayout({ children, params }: LayoutProps) {
  const { locale: raw, team } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });

  // The pages report an unknown team or an API failure themselves; the banner just stays away.
  // Anything that is not an API error (a redirect, say) must keep going up.
  const usage = await getCloudUsage(team).catch((error: unknown) =>
    isApiError(error) ? null : Promise.reject(error),
  );
  const warnings = usage ? usageWarnings(usage.meters ?? []) : null;
  const value = (key: string, amount: number) =>
    key === 'storage' ? formatBytes(amount, locale) : amount.toLocaleString(locale);

  return (
    <div className={styles.teamShell}>
      {warnings ? (
        <section
          className={`${styles.usageBanner} ${warnings.level === 'error' ? styles.usageError : styles.usageWarning}`}
          role={warnings.level === 'error' ? 'alert' : 'status'}
          aria-labelledby="usage-banner-title"
        >
          <h2 id="usage-banner-title" className={styles.usageBannerTitle}>
            {t(warnings.level === 'error' ? 'team.alert.errorTitle' : 'team.alert.warningTitle')}
          </h2>
          <ul className={styles.usageBannerList}>
            {warnings.meters.map((meter) => (
              <li key={meter.key}>
                {t('team.alert.item', {
                  label: t(`team.meters.${meter.key}`),
                  used: value(meter.key, meter.used),
                  limit: value(meter.key, meter.limit),
                  percent: meter.percent.toLocaleString(locale),
                })}
              </li>
            ))}
          </ul>
          <p className={styles.usageBannerLink}>
            <Link href={`/cloud/console/${encodeURIComponent(team)}`}>{t('team.alert.link')}</Link>
          </p>
        </section>
      ) : null}
      {children}
    </div>
  );
}
import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudMe } from '@/lib/api/cloud';
import { removeMemberAction } from '../../actions';
import styles from '../../cloud.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string; team: string }> };

/**
 * Every page of a team. While the team requires two-step verification and the account has none
 * (architecture 4.13), the API refuses the team's routes: this shows why, the way to set it up
 * and leaving the team, instead of the page. Anything else (unknown team, API down) is left to
 * the page itself.
 */
export default async function CloudTeamLayout({ children, params }: LayoutProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const me = await getCloudMe().catch(() => null);
  const team = me?.teams.find((item) => item.slug === slug);
  if (!me || !team?.twoFactorBlocked) return children;

  const t = await getTranslations({ locale, namespace: 'Cloud' });

  return (
    <div className={`${styles.landing} ${styles.narrow}`}>
      <div>
        <p className={styles.small}>
          <Link href="/cloud/console">← {t('console.title')}</Link>
        </p>
        <h1 className={styles.heroTitle}>{team.name}</h1>
      </div>
      <section className={styles.card} aria-labelledby="two-factor-title">
        <h2 id="two-factor-title" className={styles.cardTitle}>
          {t('twoFactor.blockedTitle')}
        </h2>
        <Alert tone="info">{t('twoFactor.blockedBody')}</Alert>
        <div className={styles.actions}>
          <Link href="/portal/account">{t('twoFactor.accountLink')}</Link>
          <form action={removeMemberAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="team" value={team.slug} />
            <input type="hidden" name="userId" value={me.user.id} />
            <input type="hidden" name="self" value="on" />
            <SubmitButton size="sm" variant="ghost">
              {t('members.leave')}
            </SubmitButton>
          </form>
        </div>
      </section>
    </div>
  );
}
