import { getTranslations } from 'next-intl/server';
import { albumGrantAction } from '@/app/[locale]/cruising/room-actions';
import adult from '@/components/adult/adult.module.css';
import { ActionForm } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { memberHref } from '@/lib/cruising';
import { formatDate } from '@/lib/format';
import type { AlbumGrants } from '@/lib/cruising-rooms';
import cruising from './Cruising.module.css';
import styles from './CruisingMedia.module.css';

type AlbumShareProps = {
  locale: AppLocale;
  /** The other person of the conversation. */
  nickname: string;
  /** Whether I already shared my private album with them. */
  shared: boolean;
};

/** "Share my private album" / "Revoke", from a conversation (decision 99). */
export async function AlbumShare({ locale, nickname, shared }: AlbumShareProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.album' });
  return (
    <details className={cruising.disclosure}>
      <summary>{shared ? t('revokeOpen') : t('shareOpen')}</summary>
      <ActionForm
        action={albumGrantAction.bind(null, locale, nickname, !shared)}
        className={adult.form}
      >
        <p className={adult.muted}>
          {shared ? t('revokeLead', { nickname }) : t('shareLead', { nickname })}
        </p>
        <SubmitButton
          variant="outline"
          size="sm"
          pendingLabel={shared ? t('revoking') : t('sharing')}
        >
          {shared ? t('revoke') : t('share')}
        </SubmitButton>
      </ActionForm>
    </details>
  );
}

/** My `/me` panel: who can see my private album (with "Revoke") and whose I can see. */
export async function AlbumGrantsPanel({
  locale,
  grants,
}: {
  locale: AppLocale;
  grants: AlbumGrants;
}) {
  const t = await getTranslations({ locale, namespace: 'Cruising.album' });
  return (
    <>
      <h3 className={styles.albumTitle}>{t('givenTitle')}</h3>
      {grants.given.length === 0 ? (
        <p className={adult.muted}>{t('givenEmpty')}</p>
      ) : (
        <ul className={styles.grantList} aria-label={t('givenTitle')}>
          {grants.given.map((grant) => (
            <li key={grant.nickname} className={styles.grantItem}>
              <span>
                <Link href={memberHref(grant.nickname)} className={adult.inlineLink}>
                  {grant.nickname}
                </Link>{' '}
                <span className={adult.muted}>
                  {t('since', { date: formatDate(grant.at, locale) })}
                </span>
              </span>
              <ActionForm action={albumGrantAction.bind(null, locale, grant.nickname, false)}>
                <SubmitButton variant="outline" size="sm" pendingLabel={t('revoking')}>
                  {t('revoke')}
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      {grants.received.length > 0 ? (
        <>
          <h3 className={styles.albumTitle}>{t('receivedTitle')}</h3>
          <ul className={styles.grantList} aria-label={t('receivedTitle')}>
            {grants.received.map((grant) => (
              <li key={grant.nickname} className={styles.grantItem}>
                <span>
                  <Link href={memberHref(grant.nickname)} className={adult.inlineLink}>
                    {grant.nickname}
                  </Link>{' '}
                  <span className={adult.muted}>
                    {t('since', { date: formatDate(grant.at, locale) })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
