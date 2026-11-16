import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { listSessions } from '@/lib/api/auth';
import {
  revokeAllSessionsAction,
  revokeDeviceAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from '@/lib/auth/actions';
import { WEBAPPS } from '@/lib/webapps';
import { formatDateTime } from '@/lib/format';
import { describeUserAgent } from '@/lib/user-agent';
import { ActionForm } from './ActionForm';
import styles from './app.module.css';

/**
 * "Where you're signed in": the account's live sessions, each with a sign-out button and the app
 * it belongs to (single sign-on gives each app of a browser its own session, decision 108), then
 * "Sign out of this device everywhere" and "Sign out of all devices".
 */
export async function ActiveSessions({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Sessions' });
  const ta = await getTranslations({ locale, namespace: 'AccountSite' });
  const tapps = await getTranslations({ locale, namespace: 'AppSwitcher' });
  const sessions = await listSessions();
  const others = sessions.filter((session) => !session.current);
  const clientLabel = (client: string | null) => {
    const app = WEBAPPS.find((name) => name === client);
    if (app) return tapps(`apps.${app}.name`);
    return client === 'site' ? ta('clients.site') : ta('clients.account');
  };

  return (
    <section className={styles.panel} aria-labelledby="sessions-title">
      <h2 id="sessions-title" className={styles.panelTitle}>
        {t('title')}
      </h2>
      <p className={styles.muted}>{t('lead')}</p>
      {others.length > 1 ? (
        <ActionForm action={revokeOtherSessionsAction.bind(null, locale)} className={styles.form}>
          <div className={styles.actions}>
            <SubmitButton variant="outline" pendingLabel={t('signingOut')}>
              {t('signOutOthers')}
            </SubmitButton>
          </div>
        </ActionForm>
      ) : null}
      <ul className={styles.files}>
        {sessions.map((session) => {
          const { browser, os } = describeUserAgent(session.userAgent);
          const device =
            browser && os
              ? t('browserOnOs', { browser, os })
              : (browser ?? os ?? t('unknownDevice'));
          return (
            <li key={session.id} className={styles.fileRow}>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>
                  {device} · {clientLabel(session.client)}{' '}
                  {session.current ? <Badge tone="success">{t('thisDevice')}</Badge> : null}
                </span>
                <span className={styles.muted}>
                  {t('meta', {
                    date: formatDateTime(session.lastActiveAt, locale),
                    ip: session.ip ?? t('unknownIp'),
                  })}
                </span>
              </div>
              {session.current ? null : (
                <ActionForm
                  action={revokeSessionAction.bind(null, locale, session.id)}
                  className={styles.fileDelete}
                >
                  <SubmitButton variant="outline" size="sm" pendingLabel={t('signingOut')}>
                    {t('signOut')}
                  </SubmitButton>
                </ActionForm>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.muted}>{t('delay')}</p>
      <h3>{ta('security.signOutTitle')}</h3>
      <p className={styles.muted}>{ta('security.signOutBody')}</p>
      <div className={styles.actions}>
        <ActionForm action={revokeDeviceAction.bind(null, locale)}>
          <SubmitButton variant="outline" pendingLabel={t('signingOut')}>
            {ta('security.signOutDevice')}
          </SubmitButton>
        </ActionForm>
        <ActionForm action={revokeAllSessionsAction.bind(null, locale)}>
          <SubmitButton variant="danger" pendingLabel={t('signingOut')}>
            {ta('security.signOutAll')}
          </SubmitButton>
        </ActionForm>
      </div>
    </section>
  );
}
