import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/cruising/Cruising.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import card from '@/components/cruising/CruisingCard.module.css';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { getCruisingStatus, listCruisingFavorites } from '@/lib/api/cruising';
import { requireUser } from '@/lib/auth/session';
import { formatRating, spotHref } from '@/lib/cruising';
import { formatDate } from '@/lib/format';
import adult from '@/components/adult/adult.module.css';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { favoriteAction } from '../actions';
import { CruisingGate } from '../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ locale: string }> };

/** My favourite spots (decision 85): the LIVE ones, newest first, with "N here now". */
export default async function CruisingFavoritesPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  await requireUser(locale, `/${locale}/cruising/favorites`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Cruising.favorites' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  const ts = await getTranslations({ locale, namespace: 'Cruising.spot' });
  const favorites = await listCruisingFavorites();

  return (
    <>
      <h1 className={adult.pageTitle}>{t('title')}</h1>
      <p className={adult.muted}>{t('lead')}</p>
      <p>
        <Link href="/cruising/me#me-favorites" className={adult.inlineLink}>
          {t('alertsLink')}
        </Link>
      </p>
      {favorites.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={<Button href="/cruising/map">{t('emptyAction')}</Button>}
        />
      ) : (
        <ul className={card.grid}>
          {favorites.map(({ spot, here, savedAt }) => (
            <li key={spot.id} className={card.card}>
              <h2 className={card.title}>
                <Link href={spotHref(spot.slug)} className={adult.inlineLink}>
                  {spot.name}
                </Link>
              </h2>
              <p className={card.meta}>
                <span className={styles.typeTag}>{tt(spot.type)}</span>
                <span>
                  {spot.ratingCount > 0
                    ? ts('rating', {
                        rating: formatRating(spot.ratingAvg),
                        count: spot.ratingCount,
                      })
                    : ts('noRatings')}
                </span>
              </p>
              <p
                className={
                  here > 0
                    ? `${styles.favoriteHere} ${styles.favoriteHereActive}`
                    : styles.favoriteHere
                }
              >
                {t('here', { count: here })}
              </p>
              <p className={styles.muted}>{t('savedOn', { date: formatDate(savedAt, locale) })}</p>
              <ActionForm action={favoriteAction.bind(null, locale, spot.id, false)}>
                <SubmitButton variant="outline" size="sm" pendingLabel={t('saving')}>
                  <span aria-hidden="true">★</span> {t('removeButton')}
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
