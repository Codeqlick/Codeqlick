import { getTranslations } from 'next-intl/server';
import { attendanceAction, cancelMeetupAction } from '@/app/[locale]/cruising/community-actions';
import adult from '@/components/adult/adult.module.css';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingMeetup } from '@/lib/api/cruising-community';
import { memberHref, spotHref } from '@/lib/cruising';
import styles from './CruisingCommunity.module.css';
import { LocalTime } from './LocalTime';
import { MemberName } from './MemberName';
import { ReportDetails } from './ReportDetails';
import card from './CruisingCard.module.css';

type MeetupCardProps = {
  locale: AppLocale;
  meetup: CruisingMeetup;
  /** The member may say they're going (entered, a nickname, not suspended). */
  canAct: boolean;
  /** Name the spot (on lists that mix spots). */
  showSpot?: boolean;
  /** The heading level of the title, to keep the page's outline. */
  headingLevel?: 'h3' | 'h4';
};

/**
 * One meetup (decision 88): when, where, who hosts it and who is going (anonymous ones only
 * counted), with "I'm going", "not going", the host's "cancel" and a report.
 */
export async function MeetupCard({
  locale,
  meetup,
  canAct,
  showSpot = false,
  headingLevel = 'h3',
}: MeetupCardProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.meetups' });
  const Heading = headingLevel;
  const prefix = `meetup-${meetup.id}`;
  return (
    <article className={card.card} aria-labelledby={`${prefix}-title`}>
      <Heading id={`${prefix}-title`} className={card.title}>
        {meetup.title}
      </Heading>
      <p className={styles.meta}>
        <LocalTime iso={meetup.startsAt} locale={locale} />
        {' – '}
        <LocalTime iso={meetup.endsAt} locale={locale} />
      </p>
      {showSpot ? (
        <p className={styles.meta}>
          <Link href={spotHref(meetup.spot.slug)} className={adult.inlineLink}>
            {meetup.spot.name}
          </Link>
          {` · ${meetup.spot.city}`}
        </p>
      ) : null}
      <p className={styles.meta}>
        {t('hostedBy')}{' '}
        <MemberName locale={locale} member={{ ...meetup.host, coverId: null }}>
          <Link href={memberHref(meetup.host.nickname)} className={adult.inlineLink}>
            {meetup.host.nickname}
          </Link>
        </MemberName>
      </p>
      {meetup.description ? <p className={styles.prewrap}>{meetup.description}</p> : null}
      <p className={styles.going}>
        {meetup.capacity === null
          ? t('going', { count: meetup.going })
          : t('goingOf', { count: meetup.going, capacity: meetup.capacity })}
        {meetup.full ? ` · ${t('full')}` : ''}
      </p>
      {meetup.attendees.length > 0 ? (
        <ul className={styles.names} aria-label={t('attendeesLabel')}>
          {meetup.attendees.map((attendee) => (
            <li key={attendee.nickname}>
              <MemberName locale={locale} member={{ ...attendee, coverId: null }}>
                <Link href={memberHref(attendee.nickname)} className={adult.inlineLink}>
                  {attendee.nickname}
                </Link>
              </MemberName>
            </li>
          ))}
        </ul>
      ) : null}

      {canAct && meetup.mine ? (
        <ActionForm action={cancelMeetupAction.bind(null, locale, meetup.id)}>
          <SubmitButton size="sm" variant="outline" pendingLabel={t('cancelling')}>
            {t('cancel')}
          </SubmitButton>
          <p className={styles.hint}>{t('cancelHint')}</p>
        </ActionForm>
      ) : null}
      {canAct && !meetup.mine && meetup.attending ? (
        <ActionForm action={attendanceAction.bind(null, locale, meetup.id, false)}>
          <p>{meetup.attending.anonymous ? t('youAreGoingAnonymous') : t('youAreGoing')}</p>
          <SubmitButton size="sm" variant="outline" pendingLabel={t('saving')}>
            {t('notGoing')}
          </SubmitButton>
        </ActionForm>
      ) : null}
      {canAct && !meetup.mine && !meetup.attending && !meetup.full ? (
        <ActionForm
          action={attendanceAction.bind(null, locale, meetup.id, true)}
          className={styles.inlineForm}
        >
          <FormCheckbox
            id={`${prefix}-anonymous`}
            name="anonymous"
            label={t('anonymous')}
            hint={t('anonymousHint')}
          />
          <SubmitButton size="sm" pendingLabel={t('saving')}>
            {t('imGoing')}
          </SubmitButton>
        </ActionForm>
      ) : null}
      {canAct && !meetup.mine ? (
        <ReportDetails locale={locale} kind="meetup" id={meetup.id} />
      ) : null}
    </article>
  );
}
