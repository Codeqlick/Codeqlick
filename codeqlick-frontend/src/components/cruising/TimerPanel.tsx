import { getTranslations } from 'next-intl/server';
import {
  endTimerAction,
  extendTimerAction,
  startTimerAction,
} from '@/app/[locale]/cruising/safety-actions';
import vc from '@/app/[locale]/videochat/videochat.module.css';
import { ActionForm, FormCheckbox, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getMyTimer, listTrustedContacts } from '@/lib/api/cruising-safety';
import { spotHref } from '@/lib/cruising';
import {
  EXTEND_MINUTES,
  LIMITS,
  TIMER_MINUTES,
  type CruisingTimer,
  type TrustedContact,
} from '@/lib/cruising-safety';
import { formatDateTime } from '@/lib/format';
import styles from './CruisingSafety.module.css';
import { TimerCountdown } from './TimerCountdown';

type TimerPanelProps = {
  locale: AppLocale;
  /** The spot the member can share (the one whose page this is, or their check-in's). */
  spot: { id: string; name: string } | null;
  /** Prefix of the fields' ids (the panel can be on a page twice). */
  idPrefix: string;
};

/**
 * The "Check on me" timer (decision 95): the running one with its countdown, "Extend" and "I'm
 * fine", or the form that starts one. It only starts once a trusted contact accepted.
 */
export async function TimerPanel({ locale, spot, idPrefix }: TimerPanelProps) {
  const t = await getTranslations({ locale, namespace: 'CruisingSafety.timer' });
  let timer: CruisingTimer | null = null;
  let contacts: TrustedContact[] = [];
  try {
    [timer, contacts] = await Promise.all([getMyTimer(), listTrustedContacts()]);
  } catch {
    return <p className={vc.muted}>{t('loadError')}</p>;
  }
  const accepted = contacts.filter((contact) => contact.status === 'ACCEPTED').length;
  /** "30 minutes", "2 hours", "1 h 30 min". */
  const durationLabel = (value: number) => {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (hours === 0) return t('durationMinutes', { count: minutes });
    if (minutes === 0) return t('durationHours', { count: hours });
    return t('durationMixed', { hours, minutes });
  };
  const durations = TIMER_MINUTES.map((value) => ({
    value: String(value),
    label: durationLabel(value),
  }));

  if (timer) {
    return (
      <div className={styles.timerBox}>
        <p>{t('running', { time: formatDateTime(timer.endsAt, locale) })}</p>
        <TimerCountdown
          key={timer.endsAt}
          endsAt={timer.endsAt}
          leftLabel={t('left', { time: '{time}' })}
          ranOutLabel={t('ranOut')}
        />
        {timer.message ? (
          <p className={vc.muted}>{t('yourMessage', { message: timer.message })}</p>
        ) : null}
        <p className={vc.muted}>
          {timer.spot ? (
            <>
              {t('sharing')}{' '}
              <Link href={spotHref(timer.spot.slug)} className={vc.inlineLink}>
                {timer.spot.name}
              </Link>
            </>
          ) : (
            t('notSharing')
          )}
        </p>
        <div className={styles.timerActions}>
          <ActionForm action={endTimerAction.bind(null, locale)}>
            <SubmitButton pendingLabel={t('ending')}>{t('end')}</SubmitButton>
          </ActionForm>
          <ActionForm action={extendTimerAction.bind(null, locale)} className={styles.inlineForm}>
            <FormSelect
              id={`${idPrefix}-extend`}
              name="minutes"
              label={t('extendBy')}
              options={EXTEND_MINUTES.map((value) => ({
                value: String(value),
                label: durationLabel(value),
              }))}
              defaultValue="30"
            />
            <SubmitButton variant="outline" pendingLabel={t('extending')}>
              {t('extend')}
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
    );
  }

  if (accepted === 0) {
    return (
      <p className={vc.muted}>
        {contacts.length > 0 ? t('waitingContact') : t('needContact')}{' '}
        <Link href="/cruising/me#safety-contacts" className={vc.inlineLink}>
          {t('manageContacts')}
        </Link>
      </p>
    );
  }

  return (
    <ActionForm action={startTimerAction.bind(null, locale)} className={vc.form}>
      <p className={vc.muted}>{t('lead', { count: accepted })}</p>
      <FormSelect
        id={`${idPrefix}-minutes`}
        name="minutes"
        label={t('minutes')}
        options={durations}
        defaultValue="60"
      />
      <FormTextarea
        id={`${idPrefix}-message`}
        name="message"
        label={t('message')}
        hint={t('messageHint')}
        optionalLabel={t('optional')}
        rows={2}
        maxLength={LIMITS.timerMessage}
      />
      {spot ? (
        <>
          <input type="hidden" name="spotId" value={spot.id} />
          <FormCheckbox
            id={`${idPrefix}-share`}
            name="shareSpot"
            label={t('shareSpot', { name: spot.name })}
            hint={t('shareSpotHint')}
          />
        </>
      ) : null}
      <SubmitButton pendingLabel={t('starting')}>{t('start')}</SubmitButton>
    </ActionForm>
  );
}
