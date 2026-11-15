import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getCloudProductionChecks } from '@/lib/api/cloud';
import { formatWhen, scoreTone, type ProtectionMode } from '@/lib/cloud';
import { saveProductionChecksAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type SettingsProps = {
  locale: AppLocale;
  projectId: string;
  path: string;
  admin: boolean;
  protection: ProtectionMode;
};

/**
 * The weekly website check of production (architecture 4.13, decision 80), in the Settings tab.
 * Admins switch it on or off; members see the state.
 */
export async function ProductionChecksCard(props: SettingsProps) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud.productionChecks' });
  const checks = await getCloudProductionChecks(props.projectId).catch(() => null);
  return (
    <section
      className={`${styles.card} ${styles.narrow}`}
      aria-labelledby="production-checks-title"
    >
      <h2 id="production-checks-title" className={styles.cardTitle}>
        {t('title')}
      </h2>
      <p className={styles.muted}>{t('lead')}</p>
      {checks === null ? (
        <p className={styles.muted}>{t('loadError')}</p>
      ) : (
        <>
          <p className={styles.rowTitle}>
            <Badge tone={checks.enabled ? 'success' : 'neutral'}>
              {checks.enabled ? t('on') : t('off')}
            </Badge>
            {checks.enabled && checks.nextAt ? (
              <span className={styles.small}>
                {t('next', { when: formatWhen(checks.nextAt, props.locale) })}
              </span>
            ) : null}
          </p>
          <p className={styles.small}>
            {t('address')} <span className={styles.mono}>{checks.url}</span>
          </p>
          <p className={styles.small}>{t('alerts')}</p>
          {props.protection === 'ALL' ? <p className={styles.small}>{t('protected')}</p> : null}
          {props.admin ? (
            <ActionForm
              action={saveProductionChecksAction.bind(
                null,
                props.locale,
                props.path,
                props.projectId,
              )}
              className={styles.form}
            >
              <FormCheckbox
                id="production-checks"
                name="productionChecks"
                label={t('label')}
                defaultChecked={checks.enabled}
              />
              <div className={styles.actions}>
                <SubmitButton pendingLabel={t('saving')}>{t('save')}</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className={styles.small}>{t('adminsOnly')}</p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The project's overview card for the weekly check: the last score with its date and report,
 * the four categories and the history. Shown while the check is on or there is history.
 */
export async function ProductionChecksSummary({
  locale,
  projectId,
  teamSlug,
}: {
  locale: AppLocale;
  projectId: string;
  teamSlug: string;
}) {
  const checks = await getCloudProductionChecks(projectId).catch(() => null);
  if (checks === null || (!checks.enabled && checks.items.length === 0)) return null;
  const t = await getTranslations({ locale, namespace: 'Cloud.productionChecks' });
  const last = checks.items[0];
  return (
    <section className={styles.card} aria-labelledby="production-summary-title">
      <h2 id="production-summary-title" className={styles.cardTitle}>
        {t('summaryTitle')}
      </h2>
      {last ? (
        <>
          <p className={styles.rowTitle}>
            <Badge tone={scoreTone(last.score)}>{last.score}/100</Badge>
            {last.dropped ? <Badge tone="danger">{t('dropped')}</Badge> : null}
            <span className={styles.small}>
              {t('last', { when: formatWhen(last.createdAt, locale) })}
            </span>
            <Link href={`/cloud/console/${teamSlug}/audits/${last.id}`}>{t('report')}</Link>
          </p>
          <ul className={styles.list}>
            {(['speed', 'mobile', 'seo', 'security'] as const).map((key) => (
              <li key={key} className={styles.small}>
                {t(`categories.${key}`)}: {last.categories[key]}
              </li>
            ))}
          </ul>
          <table className={styles.history}>
            <caption className="visually-hidden">{t('historyCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('date')}</th>
                <th scope="col">{t('score')}</th>
                <th scope="col">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {checks.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <Link href={`/cloud/console/${teamSlug}/audits/${item.id}`}>
                      {formatWhen(item.createdAt, locale)}
                    </Link>
                  </th>
                  <td>{item.score}/100</td>
                  <td>
                    {item.dropped ? (
                      <Badge tone="danger">{t('dropped')}</Badge>
                    ) : (
                      <span className={styles.small}>{t('steady')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : checks.nextAt ? (
        <p className={styles.muted}>{t('first', { when: formatWhen(checks.nextAt, locale) })}</p>
      ) : null}
    </section>
  );
}
