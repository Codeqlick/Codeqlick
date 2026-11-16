import { getTranslations } from 'next-intl/server';
import { favoriteAction } from '@/app/[locale]/cruising/actions';
import { ActionForm } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { listCruisingFavorites } from '@/lib/api/cruising';
import { isFavorite } from '@/lib/cruising';
import styles from './Cruising.module.css';

/**
 * The star of a spot page (decision 85), for members who have entered: saves the spot as a
 * favourite or removes it. Someone checking in at a favourite is told about without saying who.
 */
export async function FavoriteStar({
  locale,
  spotId,
  saved: known,
}: {
  locale: AppLocale;
  spotId: string;
  /** Whether it is saved, when the caller already read the favourites (a list of stars). */
  saved?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'Cruising.favorites' });
  let saved = known ?? false;
  if (known === undefined) {
    try {
      saved = isFavorite(await listCruisingFavorites(), spotId);
    } catch {
      // The page still works when the favourites can't be read: the star offers to save.
    }
  }
  return (
    <ActionForm action={favoriteAction.bind(null, locale, spotId, !saved)} className={styles.star}>
      <SubmitButton variant={saved ? 'primary' : 'outline'} size="sm" pendingLabel={t('saving')}>
        <span aria-hidden="true">{saved ? '★' : '☆'}</span> {saved ? t('remove') : t('save')}
      </SubmitButton>
      {saved ? <small className={styles.muted}>{t('removeHint')}</small> : null}
    </ActionForm>
  );
}
