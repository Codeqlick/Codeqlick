import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { CloudDomain } from '@/lib/api/cloud';
import { formatWhen } from '@/lib/cloud';
import { gradeBadgeTone } from '@/lib/surface';
import { saveSurfaceMonitorAction } from '../../../actions';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  domain: CloudDomain;
  projectId: string;
  /** `/team/project`, the path to revalidate. */
  path: string;
  teamSlug: string;
  projectSlug: string;
  admin: boolean;
};

/**
 * The Surface monitor of one verified domain, on the Domains tab (architecture 4.13, decision
 * 144): the switch (admins; read-only for members), the last scan and the next run.
 */
export async function SurfaceMonitorRow({
  locale,
  domain,
  projectId,
  path,
  teamSlug,
  projectSlug,
  admin,
}: Props) {
  const t = await getTranslations({ locale, namespace: 'Cloud.surface' });
  const last = domain.surfaceLast;
  const titleId = `surface-${domain.id}`;
  return (
    <section className={styles.stack} aria-labelledby={titleId}>
      <p id={titleId} className={styles.rowTitle}>
        <strong>{t('title')}</strong>
        <Badge tone={domain.surfaceMonitor ? 'success' : 'neutral'}>
          {domain.surfaceMonitor ? t('on') : t('off')}
        </Badge>
      </p>
      {last ? (
        <p className={styles.rowTitle}>
          {last.status === 'DONE' && last.grade ? (
            <Badge tone={gradeBadgeTone(last.grade)}>
              {t('gradeBadge', { grade: last.grade })}
            </Badge>
          ) : (
            <Badge tone="danger">{t('failedBadge')}</Badge>
          )}
          <span className={styles.small}>
            {t('lastScan', { when: formatWhen(last.createdAt, locale) })}
          </span>
        </p>
      ) : null}
      {domain.surfaceMonitor && domain.surfaceNextAt ? (
        <p className={styles.small}>
          {t(last ? 'next' : 'first', { when: formatWhen(domain.surfaceNextAt, locale) })}
        </p>
      ) : null}
      {admin ? (
        <ActionForm
          action={saveSurfaceMonitorAction.bind(null, locale, path, projectId, domain.id)}
          className={styles.form}
        >
          <FormCheckbox
            id={`surface-switch-${domain.id}`}
            name="surfaceMonitor"
            label={t('label')}
            hint={t('hint')}
            defaultChecked={domain.surfaceMonitor}
          />
          <div className={appUi.actions}>
            <SubmitButton size="sm" variant="outline" pendingLabel={t('saving')}>
              {t('save')}
              <span className="visually-hidden"> — {domain.name}</span>
            </SubmitButton>
            <Link href={`/cloud/console/${teamSlug}/${projectSlug}/domains/${domain.id}/security`}>
              {t('link')}
              <span className="visually-hidden"> — {domain.name}</span>
            </Link>
          </div>
        </ActionForm>
      ) : (
        <div className={appUi.actions}>
          <span className={styles.small}>{t('adminsOnly')}</span>
          <Link href={`/cloud/console/${teamSlug}/${projectSlug}/domains/${domain.id}/security`}>
            {t('link')}
            <span className="visually-hidden"> — {domain.name}</span>
          </Link>
        </div>
      )}
    </section>
  );
}
