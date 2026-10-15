import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { ProjectMilestone } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import styles from './ProjectTimeline.module.css';

type MilestoneState = 'done' | 'current' | 'upcoming';

/** The first milestone not done yet: what the team is working towards. */
export function nextMilestone(milestones: ProjectMilestone[]): ProjectMilestone | undefined {
  return milestones.find((milestone) => !milestone.completedAt);
}

/** Due before today (UTC dates, as the API stores them) and still open. */
function isOverdue(milestone: ProjectMilestone, today: string): boolean {
  return !milestone.completedAt && !!milestone.dueDate && milestone.dueDate.slice(0, 10) < today;
}

/**
 * Milestones of a client project as a vertical timeline, in the order the admin set: done ones
 * ticked, the next one highlighted. The admin panel passes `controls` to add its buttons to each
 * step and `showOverdue` to flag late ones.
 */
export async function ProjectTimeline({
  milestones,
  locale,
  empty,
  showOverdue = false,
  controls,
}: {
  milestones: ProjectMilestone[];
  locale: AppLocale;
  empty: string;
  showOverdue?: boolean;
  controls?: (milestone: ProjectMilestone, index: number) => ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'Portal.timeline' });
  if (milestones.length === 0) return <p className={styles.empty}>{empty}</p>;

  const next = nextMilestone(milestones);
  // Server Component: rendered once per request, never re-rendered.
  // oxlint-disable-next-line react/purity
  const today = new Date().toISOString().slice(0, 10);
  const stateOf = (milestone: ProjectMilestone): MilestoneState =>
    milestone.completedAt ? 'done' : milestone === next ? 'current' : 'upcoming';

  return (
    <ol className={styles.timeline}>
      {milestones.map((milestone, index) => {
        const state = stateOf(milestone);
        const date =
          state === 'done'
            ? t('completedOn', { date: formatDate(milestone.completedAt, locale) })
            : milestone.dueDate
              ? t('dueOn', { date: formatDate(milestone.dueDate, locale) })
              : t('noDate');
        return (
          <li key={milestone.id} className={`${styles.step} ${styles[state]}`}>
            <span className={styles.marker} aria-hidden="true">
              {state === 'done' ? (
                <svg viewBox="0 0 16 16" width="12" height="12">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <div className={styles.body}>
              <p className={styles.meta}>
                <span className={styles.state}>{t(state)}</span>
                <span>{date}</span>
                {showOverdue && isOverdue(milestone, today) ? (
                  <span className={styles.overdue}>{t('overdue')}</span>
                ) : null}
              </p>
              <h3 className={styles.title}>{milestone.title}</h3>
              {milestone.description ? (
                <p className={styles.description}>{milestone.description}</p>
              ) : null}
              {controls ? controls(milestone, index) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
