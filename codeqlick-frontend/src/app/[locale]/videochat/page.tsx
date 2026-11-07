import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { getVideochatOnline } from '@/lib/api/videochat';
import { getCurrentUser } from '@/lib/auth/session';
import styles from './videochat.module.css';

type PageProps = { params: Promise<{ locale: string }> };

/** videochat.codeqlick.com: what it is, the adult-content warning, and the way in. */
export default async function VideochatLandingPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Videochat.landing' });
  const user = await getCurrentUser();
  const room = `/${locale}/videochat/room`;
  const online = await getVideochatOnline();

  return (
    <div className={styles.landing}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>{t('eyebrow')}</p>
        {online !== null ? (
          <p className={styles.online} aria-live="polite">
            {t('online', { count: online })}
          </p>
        ) : null}
        <h1 className={styles.heroTitle}>{t('title')}</h1>
        <p className={styles.heroLead}>{t('lead')}</p>

        <div className={styles.warning} role="note">
          <strong>{t('warningTitle')}.</strong> {t('warning')}
        </div>

        <div className={styles.actions}>
          {user ? (
            <Button href="/videochat/room">{t('enter')}</Button>
          ) : (
            <>
              <Button href={`/login?next=${encodeURIComponent(room)}`}>{t('signIn')}</Button>
              <Button href="/register" variant="outline">
                {t('createAccount')}
              </Button>
            </>
          )}
          <a className={styles.leaveLink} href="https://www.google.com" rel="noreferrer">
            {t('leave')}
          </a>
        </div>
        {user ? null : <p className={styles.note}>{t('accountNote')}</p>}
      </section>

      <section className={styles.columns}>
        <div>
          <h2 className={styles.sectionTitle}>{t('howTitle')}</h2>
          <ol className={styles.steps}>
            {(['1', '2', '3'] as const).map((n) => (
              <li key={n}>
                <strong>{t(`how${n}Title`)}</strong>
                <span>{t(`how${n}`)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className={styles.sectionTitle}>{t('safetyTitle')}</h2>
          <ul className={styles.safety}>
            {(['1', '2', '3', '4'] as const).map((n) => (
              <li key={n}>{t(`safety${n}`)}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
