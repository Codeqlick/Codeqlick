import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/swipe/Swipe.module.css';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { AdZone } from '@/components/videochat/AdZone';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getSwipeStatus, listSwipeMatches } from '@/lib/api/swipe';
import { requireUser } from '@/lib/auth/session';
import vc from '../../videochat/videochat.module.css';
import { SwipeGate } from '../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string }> };

/** People who liked a photo of mine and whose photo I liked, newest conversation first. */
export default async function SwipeMatchesPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  await requireUser(locale, `/${locale}/swipe/matches`);
  const status = await getSwipeStatus();
  const gate = await SwipeGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Swipe.matches' });
  const tv = await getTranslations({ locale, namespace: 'Swipe' });
  const matches = await listSwipeMatches();

  return (
    <section className={styles.chat}>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{status.canUpload ? t('lead') : t('leadNoPhotos')}</p>
      {matches.length === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : (
        <ul className={styles.matchList}>
          {matches.map((match) => (
            <li key={match.id}>
              <Link href={`/swipe/matches/${match.id}`} className={styles.matchItem}>
                {match.partner.photoId ? (
                  // oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route
                  <img
                    src={`/${locale}/swipe/img/${match.partner.photoId}`}
                    alt=""
                    className={`${styles.avatar} ${status.profile?.blurPhotos ? styles.blurred : ''}`}
                  />
                ) : (
                  <span className={styles.avatar} aria-hidden="true" />
                )}
                <span className={styles.matchText}>
                  <strong>
                    {match.partner.nickname}
                    {match.partner.verified ? <VerifiedBadge label={tv('verified')} /> : null}
                  </strong>
                  <span>
                    {match.lastMessage
                      ? `${match.lastMessage.mine ? `${t('you')}: ` : ''}${match.lastMessage.text}`
                      : t('noMessages')}
                  </span>
                  {match.partner.albumPhotos > 0 ? (
                    <span className={styles.hint}>
                      🔒 {tv('album.matchHint', { count: match.partner.albumPhotos })}
                    </span>
                  ) : null}
                </span>
                {match.unread > 0 ? (
                  <span className={styles.unread} aria-label={t('unread', { count: match.unread })}>
                    {match.unread}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AdZone app="swipe" zone="pages" />
    </section>
  );
}
