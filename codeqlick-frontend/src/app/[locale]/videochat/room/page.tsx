import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import { VideochatRoom } from '@/components/videochat/VideochatRoom';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getVideochatStatus } from '@/lib/api/videochat';
import { requireUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import styles from '../videochat.module.css';
import { onboardAction, ticketAction } from './actions';

type PageProps = { params: Promise<{ locale: string }> };

/**
 * The signaling WebSocket as this browser opens it: VIDEOCHAT_WS_URL when set, else
 * wss://<this host>/ws in production (Nginx → API), else the local API.
 */
async function websocketUrl(): Promise<string> {
  if (env.VIDEOCHAT_WS_URL) return env.VIDEOCHAT_WS_URL;
  if (!env.isProduction) return 'ws://localhost:4000/v1/videochat/ws';
  const host = (await headers()).get('host');
  return `wss://${host}/ws`;
}

export default async function VideochatRoomPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  await requireUser(locale, `/${locale}/videochat/room`);
  const t = await getTranslations({ locale, namespace: 'Videochat' });
  const status = await getVideochatStatus();

  if (status.suspended) {
    return (
      <section className={styles.panel}>
        <h1 className={styles.pageTitle}>{t('suspended.title')}</h1>
        <p>{t('suspended.body')}</p>
      </section>
    );
  }

  if (!status.onboarded) {
    return (
      <section className={styles.panel}>
        <h1 className={styles.pageTitle}>{t('onboarding.title')}</h1>
        <p className={styles.muted}>{t('onboarding.lead')}</p>
        <div className={styles.warning} role="note">
          <strong>{t('landing.warningTitle')}.</strong> {t('landing.warning')}
        </div>
        <ActionForm action={onboardAction} className={styles.form}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="termsVersion" value={status.termsVersion} />
          <FormInput
            name="birthDate"
            type="date"
            label={t('onboarding.birthDate')}
            hint={t('onboarding.birthDateHint')}
            autoComplete="bday"
            required
          />
          <FormCheckbox name="acceptTerms" label={t('onboarding.accept')} required />
          <p>
            <Link href="/videochat/rules" target="_blank" className={styles.inlineLink}>
              {t('onboarding.readRules')}
            </Link>
          </p>
          <SubmitButton block pendingLabel={t('onboarding.submitting')}>
            {t('onboarding.submit')}
          </SubmitButton>
        </ActionForm>
      </section>
    );
  }

  if (!status.allowed) {
    return (
      <section className={styles.panel}>
        <h1 className={styles.pageTitle}>{t('ageVerification.title')}</h1>
        <p>{t('ageVerification.body')}</p>
      </section>
    );
  }

  return <VideochatRoom wsUrl={await websocketUrl()} getTicket={ticketAction} />;
}
