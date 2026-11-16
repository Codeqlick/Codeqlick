import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/cruising/Cruising.module.css';
import { MemberContributions } from '@/components/cruising/MemberContributions';
import { MemberGallery } from '@/components/cruising/MemberGallery';
import { MemberName } from '@/components/cruising/MemberName';
import { ReportDetails } from '@/components/cruising/ReportDetails';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { getCruisingMember, getCruisingStatus, listCruisingMemberMedia } from '@/lib/api/cruising';
import { requireUser } from '@/lib/auth/session';
import { countryName, isLookingFor, isNickname, normalizeNickname } from '@/lib/cruising';
import { formatDate } from '@/lib/format';
import { appPath } from '@/lib/webapp-request';
import vc from '../../../videochat/videochat.module.css';
import { blockMemberAction, startConversationAction } from '../../actions';
import { CruisingGate } from '../../Gate';

/** Members only: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string; nickname: string }> };

/** A member's profile, for members who have entered and chosen a nickname themselves. */
export default async function CruisingMemberPage({ params }: PageProps) {
  const { locale: rawLocale, nickname: rawNickname } = await params;
  const locale = resolveLocale(rawLocale);
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

  const media = await listCruisingMemberMedia(member.nickname).catch(() => []);
  const t = await getTranslations({ locale, namespace: 'Cruising.members' });
  const tl = await getTranslations({ locale, namespace: 'Cruising.lookingFor' });
  const own = status.profile.nickname === member.nickname;
  const looking = member.lookingFor.filter(isLookingFor);

  return (
    <article>
      <h1 className={vc.pageTitle}>
        <MemberName locale={locale} member={member} />
      </h1>
      <dl className={styles.profileFacts}>
        {member.age !== null ? (
          <div>
            <dt className={styles.srOnly}>{t('age')}</dt>
            <dd>{t('ageValue', { age: member.age })}</dd>
          </div>
        ) : null}
        {member.country ? (
          <div>
            <dt className={styles.srOnly}>{t('country')}</dt>
            <dd>{countryName(member.country, locale)}</dd>
          </div>
        ) : null}
        <div>
          <dt className={styles.srOnly}>{t('memberSince')}</dt>
          <dd className={styles.muted}>
            {t('memberSinceValue', { date: formatDate(member.memberSince, locale) })}
          </dd>
        </div>
      </dl>
      {member.bio ? <p className={styles.prewrap}>{member.bio}</p> : null}
      <MemberContributions
        locale={locale}
        badges={member.badges}
        contributions={member.contributions}
        title={t('contributions')}
      />
      <MemberGallery locale={locale} nickname={member.nickname} items={media} own={own} />
      {looking.length > 0 ? (
        <>
          <h2 className={styles.subTitle}>{t('lookingFor')}</h2>
          <ul className={styles.tags}>
            {looking.map((value) => (
              <li key={value} className={styles.tag}>
                {tl(value)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {own ? (
        <p>
          {t('thisIsYou')}{' '}
          <Button href="/cruising/me" variant="outline" size="sm">
            {t('editProfile')}
          </Button>
        </p>
      ) : (
        <div className={styles.profileActions}>
          <ActionForm action={startConversationAction.bind(null, locale, member.nickname)}>
            <SubmitButton pendingLabel={t('opening')}>{t('message')}</SubmitButton>
          </ActionForm>
          <details className={styles.disclosure}>
            <summary>{t('block')}</summary>
            <ActionForm
              action={blockMemberAction.bind(null, locale, member.nickname)}
              className={vc.form}
            >
              <p className={vc.muted}>{t('blockLead', { nickname: member.nickname })}</p>
              <SubmitButton variant="outline" size="sm" pendingLabel={t('blocking')}>
                {t('blockConfirm')}
              </SubmitButton>
            </ActionForm>
          </details>
          <ReportDetails locale={locale} kind="profile" id={member.nickname} />
        </div>
      )}
    </article>
  );
}
