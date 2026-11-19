import { useTranslations } from 'next-intl';
import type { SecurityCheckReport, SecurityCheckStatus } from '@/lib/api/security-checks';
import styles from './security-check.module.css';

const MARKS: Record<SecurityCheckStatus, string> = { pass: '✓', warn: '!', fail: '✕', info: 'i' };

type Groups = SecurityCheckReport['groups'];

export { gradeBand as gradeTone } from '@/lib/surface';

/** How many checks of a report ask for something (fail or warn). */
export function pointsToFix(groups: Groups): number {
  return groups
    .flatMap((group) => group.checks)
    .filter((check) => check.status === 'fail' || check.status === 'warn').length;
}

function CheckItem({ check }: { check: Groups[number]['checks'][number] }) {
  const t = useTranslations('SecurityCheck');
  return (
    <li className={styles.check} data-status={check.status}>
      <span className={styles.mark} aria-hidden="true">
        {MARKS[check.status]}
      </span>
      <div>
        <p className={styles.checkTitle}>
          {check.title}
          <span className={styles.badge}>{t(`report.status.${check.status}`)}</span>
        </p>
        <p className={styles.checkAdvice}>{check.explanation}</p>
        {check.advice ? (
          <p className={styles.checkFix}>
            <strong>{t('report.howToFix')}</strong> {check.advice}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The report's areas and findings (architecture 4.19): what needs fixing or improving first and
 * the passed checks collapsed. Used by the public report and by the Surface monitor's page.
 */
export function SecurityFindings({ groups }: { groups: Groups }) {
  const t = useTranslations('SecurityCheck');
  return (
    <>
      <ul className={styles.categories} aria-label={t('report.groupsLabel')}>
        {groups.map((group) => (
          <li key={group.key}>
            <a href={`#${group.key}`}>
              <span>{group.name}</span>
              <span className={styles.categoryScore}>
                {group.checks.filter((c) => c.status === 'fail' || c.status === 'warn').length}
                <span className="visually-hidden"> {t('report.toReviewShort')}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      {groups.map((group) => {
        const open = group.checks.filter((check) => check.status !== 'pass');
        const passed = group.checks.filter((check) => check.status === 'pass');
        return (
          <section
            key={group.key}
            id={group.key}
            className={styles.category}
            aria-labelledby={`${group.key}-title`}
          >
            <h2 id={`${group.key}-title`} className={styles.categoryTitle}>
              {group.name}
            </h2>
            {open.length > 0 ? (
              <ul className={styles.checks}>
                {open.map((check) => (
                  <CheckItem key={check.id} check={check} />
                ))}
              </ul>
            ) : null}
            {passed.length > 0 ? (
              <details className={styles.passed}>
                <summary>{t('report.passedSummary', { count: passed.length })}</summary>
                <ul className={styles.checks}>
                  {passed.map((check) => (
                    <CheckItem key={check.id} check={check} />
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
