import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingMemberRef } from '@/lib/api/cruising';
import { mediaFileEndpoint } from '@/lib/cruising-media';
import { requestWebapp } from '@/lib/webapp-request';
import styles from './CruisingMedia.module.css';
import { VerifiedBadge } from './VerifiedBadge';

type MemberNameProps = {
  locale: AppLocale;
  member: CruisingMemberRef;
  /** The name as the page writes it (a link, say); the nickname when left out. */
  children?: ReactNode;
};

/** A member's small cover photo, their name and, when the team verified them, the badge. */
export async function MemberName({ locale, member, children }: MemberNameProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.verified' });
  const onHost = (await requestWebapp()) === 'cruising';
  return (
    <span className={styles.member}>
      {member.coverId ? (
        // A private image through the BFF route: next/image can't optimise it.
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={mediaFileEndpoint(locale, onHost, member.coverId)}
          alt=""
          width={28}
          height={28}
          className={styles.avatar}
          loading="lazy"
          draggable={false}
        />
      ) : null}
      {children ?? member.nickname}
      {member.verified ? <VerifiedBadge label={t('label')} help={t('help')} /> : null}
    </span>
  );
}
