import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingContributions } from '@/lib/api/cruising';
import { cleanBadges } from '@/lib/cruising';
import styles from './Cruising.module.css';
import { ContributorBadges } from './ContributorBadges';
import { contributorLabels } from './MemberName';

type MemberContributionsProps = {
  locale: AppLocale;
  badges: readonly unknown[] | undefined;
  contributions: CruisingContributions | undefined;
  /** The heading: "Contributions" on a profile, "Your contributions" in /me. */
  title: string;
  own?: boolean;
};

/**
 * What a member gave the directory (decision 93): their badges and the counters behind them. Shown
 * on the profile; in /me with how the badges are earned.
 */
export async function MemberContributions({
  locale,
  badges,
  contributions,
  title,
  own = false,
}: MemberContributionsProps) {
  if (!contributions) return null;
  const t = await getTranslations({ locale, namespace: 'Cruising.badges' });
  const earned = cleanBadges(badges);
  return (
    <section aria-label={title} className={styles.contributions}>
      <h2 className={styles.subTitle}>{title}</h2>
      {earned.length > 0 ? (
        <p>
          <ContributorBadges badges={earned} labels={await contributorLabels(locale)} size="md" />
        </p>
      ) : null}
      <ul className={styles.contributionList}>
        <li>{t('spotsLive', { count: contributions.spotsLive })}</li>
        <li>{t('reviewsWritten', { count: contributions.reviewsWritten })}</li>
        <li>{t('helpfulReceived', { count: contributions.helpfulReceived })}</li>
      </ul>
      {own ? <p className={styles.muted}>{t('howTo')}</p> : null}
    </section>
  );
}
