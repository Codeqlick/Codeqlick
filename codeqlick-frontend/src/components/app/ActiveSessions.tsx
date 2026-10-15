import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { listSessions } from '@/lib/api/auth';
import { revokeOtherSessionsAction, revokeSessionAction } from '@/lib/auth/actions';
import { formatDateTime } from '@/lib/format';
import { describeUserAgent } from '@/lib/user-agent';
import { ActionForm } from './ActionForm';
import styles from './app.module.css';

/** "Where you're signed in": the account's live sessions, each with a sign-out button. */
export async function ActiveSessions({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Sessions' });
  const sessions = await listSessions();
  const others = sessions.filter((session) => !session.current);

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{t('title')}</h2>
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
                  {device}{' '}
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
    </section>
  );
}
