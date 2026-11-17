import { getTranslations } from 'next-intl/server';
import { checkInAction, endCheckInAction } from '@/app/[locale]/cruising/actions';
import adult from '@/components/adult/adult.module.css';
import { ActionForm, FormCheckbox, FormSelect } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import {
  getCruisingPresence,
  getMyCruisingCheckIn,
  type CruisingCheckIn,
  type CruisingPresence,
  type CruisingSpotPublic,
  type CruisingStatus,
} from '@/lib/api/cruising';
import { CHECK_IN_HOURS, memberHref } from '@/lib/cruising';
import { formatDateTime } from '@/lib/format';
import styles from './Cruising.module.css';
import { MemberName } from './MemberName';
import { TimerPanel } from './TimerPanel';

type SpotPresenceProps = { locale: AppLocale; spot: CruisingSpotPublic; status: CruisingStatus };

/**
 * Who is at a spot now and the "I'm here" check-in, for members who have entered. A check-in is
 * the spot and nothing else: the person's position is never asked for. Without a nickname the
 * check-in asks for one first (on `/me`).
 */
export async function SpotPresence({ locale, spot, status }: SpotPresenceProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.presence' });
  const tt = await getTranslations({ locale, namespace: 'CruisingSafety.timer' });
  const hasNickname = status.profile !== null;

  let presence: CruisingPresence | null = null;
  let mine: CruisingCheckIn | null = null;
  try {
    presence = await getCruisingPresence(spot.id);
    if (hasNickname) mine = await getMyCruisingCheckIn();
  } catch {
    // The page still works when presence can't be read.
  }
  if (!presence && !hasNickname) return null;
  const here = mine?.spot.id === spot.id;
  const hours = CHECK_IN_HOURS.map((value) => ({
    value: String(value),
    label: t('hours', { count: value }),
  }));

  return (
    <section className={styles.section} aria-labelledby="presence-title">
      <h2 id="presence-title" className={adult.sectionTitle}>
        {t('title')}
      </h2>
      <div className={styles.presence}>
        {presence ? (
          <>
            <p className={styles.presenceCount}>{t('count', { count: presence.count })}</p>
            {presence.members.length > 0 ? (
              <ul className={styles.hereList} aria-label={t('membersLabel')}>
                {presence.members.map((member) => (
                  <li key={member.nickname}>
                    <MemberName locale={locale} member={member}>
                      <Link href={memberHref(member.nickname)} className={adult.inlineLink}>
                        {member.nickname}
                      </Link>
                    </MemberName>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}

        {hasNickname ? (
          <>
            {mine ? (
              <>
                <p>
                  {here
                    ? t('youAreHere', { time: formatDateTime(mine.expiresAt, locale) })
                    : t('youAreElsewhere', {
                        name: mine.spot.name,
                        time: formatDateTime(mine.expiresAt, locale),
                      })}
                  {mine.anonymous ? ` ${t('anonymousNote')}` : ''}
                </p>
                <ActionForm action={endCheckInAction.bind(null, locale)}>
                  <SubmitButton size="sm" variant="outline" pendingLabel={t('ending')}>
                    {t('end')}
                  </SubmitButton>
                </ActionForm>
              </>
            ) : null}
            <ActionForm action={checkInAction.bind(null, locale, spot.id)} className={adult.form}>
              <FormSelect
                id="checkin-hours"
                name="hours"
                label={t('duration')}
                options={hours}
                defaultValue="1"
              />
              <FormCheckbox
                id="checkin-anonymous"
                name="anonymous"
                label={t('anonymous')}
                hint={t('anonymousHint')}
              />
              <SubmitButton pendingLabel={t('checkingIn')}>
                {here ? t('renew') : t('checkIn')}
              </SubmitButton>
            </ActionForm>
            <p className={adult.muted}>{t('privacy')}</p>
            <h3 className={styles.subTitle}>{tt('title')}</h3>
            <TimerPanel
              locale={locale}
              spot={{ id: spot.id, name: spot.name }}
              idPrefix="spot-timer"
            />
          </>
        ) : (
          <p className={adult.muted}>
            {t('needNickname')}{' '}
            <Link href="/cruising/me" className={adult.inlineLink}>
              {t('chooseNickname')}
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
