import { getTranslations } from 'next-intl/server';
import { CopyLink } from '@/components/app/CopyLink';
import { Badge } from '@/components/ui/Badge';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import {
  getCloudAnalytics,
  getCloudAnalyticsShare,
  type CloudAnalyticsPeriod,
} from '@/lib/api/cloud';
import { appPath } from '@/lib/webapp-request';
import { webappUrl } from '@/lib/webapp-seo';
import {
  renewAnalyticsLinkAction,
  shareAnalyticsAction,
  toggleAnalyticsAction,
  unshareAnalyticsAction,
} from '../../../actions';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../../cloud.module.css';
import { AnalyticsReport } from './AnalyticsReport';

type Props = {
  locale: AppLocale;
  projectId: string;
  path: string;
  base: string;
  admin: boolean;
  period: CloudAnalyticsPeriod;
};

/** A project's web analytics (architecture 4.13 "Web analytics", decision 44). */
export async function AnalyticsTab(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const [report, share] = await Promise.all([
    getCloudAnalytics(props.projectId, props.period).catch(() => null),
    getCloudAnalyticsShare(props.projectId).catch(() => null),
  ]);
  if (!report) return <p className={styles.muted}>{t('common.loadError')}</p>;
  const csv = await appPath(`/${props.locale}${props.base}/analytics/csv`, props.locale);
  const shareUrl = share?.token
    ? webappUrl('cloud', props.locale, `/analytics/${share.token}`)
    : share?.url;
  const hidden = (
    <>
      <input type="hidden" name="locale" value={props.locale} />
      <input type="hidden" name="project" value={props.projectId} />
      <input type="hidden" name="path" value={props.path} />
    </>
  );
  return (
    <section className={styles.landing} aria-labelledby="analytics-title">
      <div>
        <h2 id="analytics-title" className={appUi.sectionTitle}>
          {t('project.tabs.analytics')}{' '}
          <Badge tone={report.enabled ? 'success' : 'neutral'}>
            {report.enabled ? t('analytics.on') : t('analytics.off')}
          </Badge>
        </h2>
        <p className={styles.muted}>{t('analytics.lead')}</p>
      </div>

      <article className={`${appUi.card} ${styles.narrow}`}>
        <p className={styles.small}>{t('analytics.snippetHelp')}</p>
        <CopyLink
          url={report.snippet}
          labels={{ copy: t('common.copy'), copied: t('common.copied') }}
        />
        <p className={styles.small}>{t('analytics.events')}</p>
        <pre className={styles.terminal}>{"codeqlick.track('signup')"}</pre>
        {props.admin ? (
          <form action={toggleAnalyticsAction}>
            <input type="hidden" name="locale" value={props.locale} />
            <input type="hidden" name="project" value={props.projectId} />
            <input type="hidden" name="path" value={props.path} />
            <input type="hidden" name="enabled" value={report.enabled ? 'off' : 'on'} />
            <SubmitButton size="sm" variant={report.enabled ? 'outline' : 'primary'}>
              {report.enabled ? t('analytics.turnOff') : t('analytics.turnOn')}
            </SubmitButton>
          </form>
        ) : null}
        <p className={styles.small}>{t('analytics.privacy')}</p>
      </article>

      {share ? (
        <article className={`${appUi.card} ${styles.narrow}`} aria-labelledby="share-title">
          <h3 id="share-title" className={styles.rowTitle}>
            {t('analytics.share.title')}{' '}
            <Badge tone={share.enabled ? 'success' : 'neutral'}>
              {share.enabled ? t('analytics.share.on') : t('analytics.share.off')}
            </Badge>
          </h3>
          <p className={styles.small}>{t('analytics.share.help')}</p>
          {!report.enabled ? <p className={styles.small}>{t('analytics.share.offHint')}</p> : null}
          {props.admin && share.enabled ? (
            <>
              {shareUrl ? (
                <CopyLink
                  url={shareUrl}
                  labels={{ copy: t('common.copy'), copied: t('common.copied') }}
                />
              ) : null}
              <ActionForm
                action={renewAnalyticsLinkAction.bind(
                  null,
                  props.locale,
                  props.path,
                  props.projectId,
                )}
                className={styles.form}
              >
                <FormCheckbox
                  id="confirm-new-analytics-link"
                  name="confirm"
                  label={t('analytics.share.confirmNew')}
                  required
                />
                <div className={appUi.actions}>
                  <SubmitButton size="sm" variant="outline">
                    {t('analytics.share.newLink')}
                  </SubmitButton>
                </div>
              </ActionForm>
              <form action={unshareAnalyticsAction}>
                {hidden}
                <SubmitButton size="sm" variant="outline">
                  {t('analytics.share.stop')}
                </SubmitButton>
              </form>
            </>
          ) : null}
          {props.admin && !share.enabled ? (
            <form action={shareAnalyticsAction}>
              {hidden}
              <SubmitButton size="sm">{t('analytics.share.create')}</SubmitButton>
            </form>
          ) : null}
        </article>
      ) : null}

      <AnalyticsReport
        locale={props.locale}
        report={report}
        period={props.period}
        periodHref={(period) => `${props.base}?tab=analytics&period=${period}`}
        csvHref={`${csv}?period=${props.period}`}
      />
    </section>
  );
}
