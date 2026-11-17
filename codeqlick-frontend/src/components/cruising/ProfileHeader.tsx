import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingContributions } from '@/lib/api/cruising';
import { cleanBadges, countryName, isLookingFor } from '@/lib/cruising';
import { mediaFileEndpoint } from '@/lib/cruising-media';
import { initials } from '@/lib/cruising-profile';
import { formatDate } from '@/lib/format';
import { requestWebapp } from '@/lib/webapp-request';
import { ContributorBadges } from './ContributorBadges';
import styles from './CruisingProfile.module.css';
import { contributorLabels } from './MemberName';
import { VerifiedBadge } from './VerifiedBadge';

export type ProfileHeaderMember = {
  nickname: string;
  verified: boolean;
  coverId: string | null;
  bio: string;
  country: string | null;
  lookingFor: readonly string[];
  /** Null when not shown. */
  age: number | null;
  memberSince?: string;
  badges?: readonly unknown[];
  contributions?: CruisingContributions;
};

type ProfileHeaderProps = {
  locale: AppLocale;
  member: ProfileHeaderMember;
  /** The page's title (a profile) or a small preview of it (`/me`'s "How others see you"). */
  variant?: 'page' | 'preview';
  /** The nickname's heading: the page's h1, or an h3 in a preview. */
  headingId?: string;
  /** Under the bio: the action bar of a profile, the link of a preview. */
  children?: ReactNode;
};

/** A member's avatar: their cover photo, else their initials (decorative: the name is next to it). */
export async function ProfileAvatar({
  locale,
  nickname,
  coverId,
  small = false,
}: {
  locale: AppLocale;
  nickname: string;
  coverId: string | null;
  small?: boolean;
}) {
  const className = small ? `${styles.avatar} ${styles.avatarSmall}` : styles.avatar;
  if (!coverId) {
    return (
      <span className={className} aria-hidden="true">
        {initials(nickname)}
      </span>
    );
  }
  const onHost = (await requestWebapp()) === 'cruising';
  return (
    // A private image through the BFF route: next/image can't optimise it.
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src={mediaFileEndpoint(locale, onHost, coverId)}
      alt=""
      width={small ? 56 : 88}
      height={small ? 56 : 88}
      className={className}
      draggable={false}
    />
  );
}

/**
 * The header of a member's profile (architecture 4.15, "Profile pages"): a cover (their cover photo
 * blurred, else the brand's gradient), the avatar, the nickname with the Verified badge, age,
 * country, member since, contributor badges, what they're looking for and the bio.
 */
export async function ProfileHeader({
  locale,
  member,
  variant = 'page',
  headingId,
  children,
}: ProfileHeaderProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.members' });
  const tl = await getTranslations({ locale, namespace: 'Cruising.lookingFor' });
  const tv = await getTranslations({ locale, namespace: 'Cruising.verified' });
  const tb = await getTranslations({ locale, namespace: 'Cruising.badges' });
  const onHost = (await requestWebapp()) === 'cruising';
  const preview = variant === 'preview';
  const Heading = preview ? 'h3' : 'h1';
  const Frame = preview ? 'div' : 'header';
  const looking = member.lookingFor.filter(isLookingFor);
  const badges = cleanBadges(member.badges);
  const facts: { key: string; term: string; value: string }[] = [];
  if (member.age !== null) {
    facts.push({ key: 'age', term: t('age'), value: t('ageValue', { age: member.age }) });
  }
  if (member.country) {
    facts.push({ key: 'country', term: t('country'), value: countryName(member.country, locale) });
  }
  if (member.memberSince && !preview) {
    facts.push({
      key: 'since',
      term: t('memberSince'),
      value: t('memberSinceValue', { date: formatDate(member.memberSince, locale) }),
    });
  }

  return (
    <Frame className={preview ? styles.overviewBody : styles.hero}>
      {preview ? null : (
        <div className={styles.cover}>
          {member.coverId ? (
            // The cover photo, blurred: only a backdrop (the avatar shows it).
            // oxlint-disable-next-line nextjs/no-img-element
            <img
              src={mediaFileEndpoint(locale, onHost, member.coverId)}
              alt=""
              className={styles.coverImage}
              draggable={false}
            />
          ) : null}
        </div>
      )}
      <div className={preview ? styles.previewBody : styles.heroBody}>
        <div className={preview ? styles.previewHead : styles.identity}>
          <ProfileAvatar
            locale={locale}
            nickname={member.nickname}
            coverId={member.coverId}
            small={preview}
          />
          <div className={styles.identityText}>
            <Heading
              id={headingId}
              className={preview ? `${styles.name} ${styles.nameSmall}` : styles.name}
            >
              {member.nickname}
              {member.verified ? <VerifiedBadge label={tv('label')} help={tv('help')} /> : null}
            </Heading>
            {facts.length > 0 ? (
              <dl className={styles.facts}>
                {facts.map((fact) => (
                  <div key={fact.key}>
                    <dt className={styles.srOnly}>{fact.term}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>
        {badges.length > 0 ? (
          <p className={styles.muted}>
            <ContributorBadges badges={badges} labels={await contributorLabels(locale)} size="md" />
          </p>
        ) : null}
        {member.contributions && !preview ? (
          <ul className={styles.stats} aria-label={t('contributions')}>
            <li>{tb('spotsLive', { count: member.contributions.spotsLive })}</li>
            <li>{tb('reviewsWritten', { count: member.contributions.reviewsWritten })}</li>
            <li>{tb('helpfulReceived', { count: member.contributions.helpfulReceived })}</li>
          </ul>
        ) : null}
        {looking.length > 0 ? (
          <ul className={styles.chips} aria-label={t('lookingFor')}>
            {looking.map((value) => (
              <li key={value} className={styles.chip}>
                {tl(value)}
              </li>
            ))}
          </ul>
        ) : null}
        {member.bio ? (
          <p className={preview ? `${styles.bio} ${styles.bioClamp}` : styles.bio}>{member.bio}</p>
        ) : null}
        {children}
      </div>
    </Frame>
  );
}
