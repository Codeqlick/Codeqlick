import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import { AlbumShare } from '@/components/cruising/AlbumShare';
import community from '@/components/cruising/CruisingCommunity.module.css';
import styles from '@/components/cruising/CruisingProfile.module.css';
import { MeetupCard } from '@/components/cruising/MeetupCard';
import { MemberGallery } from '@/components/cruising/MemberGallery';
import { MemberHealth } from '@/components/cruising/MemberHealth';
import { ProfileHeader } from '@/components/cruising/ProfileHeader';
import { ReportDetails } from '@/components/cruising/ReportDetails';
import { SectionNav } from '@/components/cruising/SectionNav';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import {
  getCruisingMember,
  getCruisingMemberActivity,
  getCruisingStatus,
  listCruisingConversations,
  listCruisingMemberMedia,
  type CruisingMemberActivity,
} from '@/lib/api/cruising';
import { listCruisingMeetups, type CruisingMeetup } from '@/lib/api/cruising-community';
import { getCruisingAlbumGrants } from '@/lib/api/cruising-rooms';
import { requireUser } from '@/lib/auth/session';
import { countryName, formatRating, isNickname, normalizeNickname, spotHref } from '@/lib/cruising';
import { MEMBER_SECTIONS } from '@/lib/cruising-profile';
import { hasGiven, NO_GRANTS } from '@/lib/cruising-rooms';
import { formatDate } from '@/lib/format';
import { appPath } from '@/lib/webapp-request';
import { blockMemberAction, startConversationAction } from '../../actions';
import { CruisingGate } from '../../Gate';
import { winkAction } from '../../notifications-actions';

/** Members only: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string; nickname: string }> };

/** `★★★☆☆`, for the eyes only: the number is said in words next to it. */
function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className={styles.stars}>
      <span aria-hidden="true">{'★'.repeat(rating) + '☆'.repeat(5 - rating)}</span>
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}

/**
 * A member's profile (architecture 4.15, "Profile pages"), for members who have entered and chosen
 * a nickname themselves: the header, the action bar, then their photos, reviews, spots and meetups
 * under a sticky sub-nav.
 */
export default async function CruisingMemberPage({ params }: PageProps) {
  const { locale: rawLocale, nickname: rawNickname } = await params;
  const locale = resolveCruisingLocale(rawLocale);
  const nickname = normalizeNickname(rawNickname);
  await requireUser(locale, `/${locale}/cruising/members/${nickname}`);
  if (!isNickname(nickname)) notFound();
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  // Profiles are seen by members with a nickname: choose one first.
  if (!status.profile) redirect(await appPath(`/${locale}/cruising/me`, locale));
  const member = await getCruisingMember(nickname);
  if (!member) notFound();
  const own = status.profile.nickname === member.nickname;

  const [media, activity, meetups, conversations, grants] = await Promise.all([
    listCruisingMemberMedia(member.nickname).catch(() => []),
    getCruisingMemberActivity(member.nickname).catch((): CruisingMemberActivity | null => null),
    listCruisingMeetups({ member: member.nickname }).catch((): CruisingMeetup[] | null => null),
    own ? Promise.resolve([]) : listCruisingConversations().catch(() => []),
    own ? Promise.resolve(NO_GRANTS) : getCruisingAlbumGrants().catch(() => NO_GRANTS),
  ]);
  const t = await getTranslations({ locale, namespace: 'Cruising.members' });
  const tw = await getTranslations({ locale, namespace: 'Cruising.winks' });
  const tr = await getTranslations({ locale, namespace: 'Cruising.reviews' });
  const ts = await getTranslations({ locale, namespace: 'Cruising.spot' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  // Sharing my private album needs a conversation with them (decision 99).
  const talking = conversations.some(
    (conversation) => conversation.partner.nickname === member.nickname,
  );
  const publicMedia = media.filter((item) => (item.album ?? 'PUBLIC') === 'PUBLIC');
  const privateMedia = media.filter((item) => item.album === 'PRIVATE');
  const reviews = activity?.reviews ?? [];
  const spots = activity?.spots ?? [];
  const canAct = status.allowed;
  const counts = {
    photos: media.length,
    reviews: reviews.length,
    spots: spots.length,
    meetups: meetups?.length ?? 0,
  };

  return (
    <article className={styles.page} aria-labelledby="member-name">
      <ProfileHeader locale={locale} member={member} headingId="member-name">
        <MemberHealth locale={locale} health={member.health} />
        {own ? (
          <div className={styles.actions}>
            <p className={styles.muted}>{t('thisIsYou')}</p>
            <Button href="/cruising/me" variant="outline" size="sm">
              {t('editProfile')}
            </Button>
          </div>
        ) : (
          <div className={styles.actions}>
            <ActionForm action={startConversationAction.bind(null, locale, member.nickname)}>
              <SubmitButton pendingLabel={t('opening')}>{t('message')}</SubmitButton>
            </ActionForm>
            {/* A wink (decision 97): one a day per member; the button says when it's done. */}
            {member.winked ? (
              <p className={styles.done}>{tw('winkedToday')}</p>
            ) : (
              <ActionForm action={winkAction.bind(null, locale, member.nickname)}>
                <SubmitButton variant="outline" pendingLabel={tw('sending')}>
                  {tw('wink')}
                </SubmitButton>
              </ActionForm>
            )}
            {talking ? (
              <div className={styles.album}>
                <AlbumShare
                  locale={locale}
                  nickname={member.nickname}
                  shared={hasGiven(grants, member.nickname)}
                />
              </div>
            ) : null}
            {/* Block and Report, out of the way: a disclosure that works without JavaScript. */}
            <details className={styles.more}>
              <summary aria-label={t('moreActions')} title={t('moreActions')}>
                <span aria-hidden="true">⋯</span>
              </summary>
              <div className={styles.menu}>
                <details>
                  <summary>{t('block')}</summary>
                  <ActionForm
                    action={blockMemberAction.bind(null, locale, member.nickname)}
                    className={styles.cards}
                  >
                    <p className={styles.muted}>{t('blockLead', { nickname: member.nickname })}</p>
                    <SubmitButton variant="outline" size="sm" pendingLabel={t('blocking')}>
                      {t('blockConfirm')}
                    </SubmitButton>
                  </ActionForm>
                </details>
                <ReportDetails locale={locale} kind="profile" id={member.nickname} />
              </div>
            </details>
          </div>
        )}
      </ProfileHeader>

      <SectionNav
        label={t('sectionsLabel')}
        items={MEMBER_SECTIONS.map((section) => ({
          id: section,
          label: t(`sections.${section}`),
          count: counts[section],
        }))}
      />

      <div className={styles.sections}>
        <section id="photos" className={styles.group} aria-labelledby="photos-title">
          <h2 id="photos-title" className={styles.groupTitle}>
            {t('sections.photos')}
          </h2>
          {publicMedia.length === 0 && privateMedia.length === 0 ? (
            <p className={styles.empty}>{t('photosEmpty', { nickname: member.nickname })}</p>
          ) : (
            <>
              <MemberGallery
                locale={locale}
                nickname={member.nickname}
                items={media}
                own={own}
                headingLevel="h3"
              />
              <MemberGallery
                locale={locale}
                nickname={member.nickname}
                items={media}
                own={own}
                album="PRIVATE"
                headingLevel="h3"
              />
            </>
          )}
        </section>

        <section id="reviews" className={styles.group} aria-labelledby="reviews-title">
          <h2 id="reviews-title" className={styles.groupTitle}>
            {t('sections.reviews')}
          </h2>
          {activity === null ? (
            <Alert tone="error">{t('loadError')}</Alert>
          ) : reviews.length === 0 ? (
            <p className={styles.empty}>{t('reviewsEmpty')}</p>
          ) : (
            <ul className={styles.cards}>
              {reviews.map((review) => (
                <li key={review.id}>
                  <article className={styles.card} aria-labelledby={`review-${review.id}`}>
                    <div className={styles.itemHead}>
                      <h3 id={`review-${review.id}`} className={styles.cardTitle}>
                        <Link href={spotHref(review.spot.slug)} className={styles.link}>
                          {review.spot.name}
                        </Link>
                      </h3>
                      <Stars rating={review.rating} label={tr('stars', { count: review.rating })} />
                    </div>
                    <p className={styles.meta}>
                      {review.spot.city} · {countryName(review.spot.countryCode, locale)} ·{' '}
                      <time dateTime={review.createdAt}>
                        {formatDate(review.createdAt, locale)}
                      </time>
                    </p>
                    {review.text ? <p className={styles.bio}>{review.text}</p> : null}
                    {review.helpful > 0 ? (
                      <p className={styles.meta}>{tr('helpfulCount', { count: review.helpful })}</p>
                    ) : null}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="spots" className={styles.group} aria-labelledby="spots-title">
          <h2 id="spots-title" className={styles.groupTitle}>
            {t('sections.spots')}
          </h2>
          {activity === null ? (
            <Alert tone="error">{t('loadError')}</Alert>
          ) : spots.length === 0 ? (
            <p className={styles.empty}>{t('spotsEmpty')}</p>
          ) : (
            <ul className={styles.cardGrid}>
              {spots.map((spot) => (
                <li key={spot.id} className={styles.card}>
                  <h3 className={styles.cardTitle}>
                    <Link href={spotHref(spot.slug)} className={styles.link}>
                      {spot.name}
                    </Link>
                  </h3>
                  <p className={styles.meta}>
                    {tt(spot.type)} · {spot.city} · {countryName(spot.countryCode, locale)}
                  </p>
                  <p className={styles.meta}>
                    {spot.ratingCount > 0
                      ? ts('rating', {
                          rating: formatRating(spot.ratingAvg),
                          count: spot.ratingCount,
                        })
                      : ts('noRatings')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="meetups" className={styles.group} aria-labelledby="meetups-title">
          <h2 id="meetups-title" className={styles.groupTitle}>
            {t('sections.meetups')}
          </h2>
          {meetups === null ? (
            <Alert tone="error">{t('loadError')}</Alert>
          ) : meetups.length === 0 ? (
            <p className={styles.empty}>{t('meetupsEmpty')}</p>
          ) : (
            <ul className={community.list}>
              {meetups.map((meetup) => (
                <li key={meetup.id}>
                  <MeetupCard locale={locale} meetup={meetup} canAct={canAct} showSpot />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
