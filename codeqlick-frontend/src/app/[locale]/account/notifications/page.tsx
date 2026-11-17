import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { PageHeader } from '@/components/app/PageHeader';
import styles from '@/components/app/app.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveCruisingLocale } from '@/i18n/locale';
import { accountApps, getPreferences } from '@/lib/api/auth';
import { getCruisingStatus } from '@/lib/api/cruising';
import { getCruisingVisits } from '@/lib/api/cruising-notifications';
import { getSwipeStatus } from '@/lib/api/swipe';
import { getVideochatStatus } from '@/lib/api/videochat';
import { updatePreferencesAction } from '@/lib/auth/actions';
import { requestBrand } from '@/lib/request-brand';
import { requireUser } from '@/lib/auth/session';
import {
  cruisingNotificationsAction,
  swipeNotificationsAction,
  videochatNotificationsAction,
} from '../actions';

/**
 * Every optional email and alert of every app the person uses, in one place, each saved through
 * its app's own endpoint. Turning push on for a device stays in each app (its service worker).
 */
export default async function AccountNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveCruisingLocale((await params).locale);
  const user = await requireUser(locale);
  const neoqlick = (await requestBrand()) === 'neoqlick';
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const ta = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tapps = await getTranslations({ locale, namespace: 'AppSwitcher' });

  const apps = new Set((await accountApps().catch(() => ({ items: [] }))).items.map((a) => a.app));
  const [preferences, cruising, visits, swipe, videochat] = await Promise.all([
    // The website's digest and report are for Codeqlick's clients, not for Neoqlick's accounts.
    user.role === 'CLIENT' && !neoqlick ? getPreferences() : null,
    apps.has('cruising') ? getCruisingStatus().catch(() => null) : null,
    apps.has('cruising') ? getCruisingVisits().catch(() => null) : null,
    apps.has('swipe') ? getSwipeStatus().catch(() => null) : null,
    apps.has('videochat') ? getVideochatStatus().catch(() => null) : null,
  ]);
  const save = <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>;
  const nothing = !preferences && !cruising && !swipe?.profile && !videochat?.onboarded;

  return (
    <div className={styles.stack}>
      <PageHeader title={t('nav.notifications')} lead={t('notifications.lead')} />
      {nothing ? <p className={styles.muted}>{t('notifications.none')}</p> : null}

      {preferences ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('clients.site')}</h2>
          <ActionForm
            action={updatePreferencesAction.bind(null, locale)}
            className={`${styles.form} ${styles.formNarrow}`}
          >
            <FormCheckbox
              name="weeklyDigest"
              label={ta('weeklyDigest')}
              hint={ta('weeklyDigestHint')}
              defaultChecked={preferences.weeklyDigest}
            />
            <FormCheckbox
              name="monthlyReport"
              label={ta('monthlyReport')}
              hint={ta('monthlyReportHint')}
              defaultChecked={preferences.monthlyReport}
            />
            <div className={styles.actions}>{save}</div>
          </ActionForm>
        </section>
      ) : null}

      {cruising ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{tapps('apps.cruising.name')}</h2>
          <ActionForm
            action={cruisingNotificationsAction.bind(null, locale)}
            className={`${styles.form} ${styles.formNarrow}`}
          >
            <FormCheckbox
              name="emailAlerts"
              label={t('notifications.cruisingEmailAlerts')}
              defaultChecked={cruising.emailAlerts}
            />
            <FormCheckbox
              name="favoriteEmails"
              label={t('notifications.cruisingFavoriteEmails')}
              defaultChecked={cruising.favoriteEmails}
            />
            <FormCheckbox
              name="favoriteAlerts"
              label={t('notifications.cruisingFavoriteAlerts')}
              defaultChecked={cruising.favoriteAlerts}
            />
            <FormCheckbox
              name="showVisits"
              label={t('notifications.cruisingShowVisits')}
              defaultChecked={visits?.showVisits ?? false}
            />
            <div className={styles.actions}>{save}</div>
          </ActionForm>
        </section>
      ) : null}

      {swipe?.profile ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{tapps('apps.swipe.name')}</h2>
          <ActionForm
            action={swipeNotificationsAction.bind(null, locale)}
            className={`${styles.form} ${styles.formNarrow}`}
          >
            <FormCheckbox
              name="emailAlerts"
              label={t('notifications.swipeEmailAlerts')}
              defaultChecked={swipe.profile.emailAlerts}
            />
            <div className={styles.actions}>{save}</div>
          </ActionForm>
        </section>
      ) : null}

      {videochat?.onboarded ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{tapps('apps.videochat.name')}</h2>
          <ActionForm
            action={videochatNotificationsAction.bind(null, locale)}
            className={`${styles.form} ${styles.formNarrow}`}
          >
            <FormCheckbox
              name="peakAlerts"
              label={t('notifications.videochatPeakAlerts')}
              defaultChecked={videochat.peakAlerts}
            />
            <div className={styles.actions}>{save}</div>
          </ActionForm>
        </section>
      ) : null}

      <p className={styles.muted}>{t('notifications.push')}</p>
    </div>
  );
}
