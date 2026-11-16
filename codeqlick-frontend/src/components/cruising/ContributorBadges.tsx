import type { ContributorBadge } from '@/lib/cruising';
import styles from './Cruising.module.css';

type ContributorBadgesProps = {
  badges: readonly ContributorBadge[];
  /** Each badge's name ("Explorer") and what it means, from `Cruising.badges`. */
  labels: Record<ContributorBadge, { label: string; help: string }>;
  /** Small, next to a nickname (reviews), or full size (the profile). */
  size?: 'sm' | 'md';
};

/**
 * A member's contributor badges (decision 93): Explorer or Guide (spots published), Helpful
 * (helpful votes received), Local (reviews written). The meaning is the tooltip and the screen
 * reader's text.
 */
export function ContributorBadges({ badges, labels, size = 'sm' }: ContributorBadgesProps) {
  if (badges.length === 0) return null;
  return (
    <span className={size === 'sm' ? styles.badgesSmall : styles.badges}>
      {badges.map((badge) => (
        <span key={badge} className={styles.contributorBadge} title={labels[badge].help}>
          {labels[badge].label}
          <span className={styles.srOnly}>. {labels[badge].help}</span>
        </span>
      ))}
    </span>
  );
}
