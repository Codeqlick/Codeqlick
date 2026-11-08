import { getTranslations } from 'next-intl/server';
import styles from '@/components/swipe/Swipe.module.css';
import { SwipeDeck } from '@/components/swipe/SwipeDeck';
import { resolveLocale } from '@/i18n/locale';
import { getSwipeDeck, getSwipeStatus } from '@/lib/api/swipe';
import { requireUser } from '@/lib/auth/session';
import { deckAction, reportAction, undoAction, voteAction } from '../actions';
import { SwipeGate } from '../Gate';

type PageProps = { params: Promise<{ locale: string }> };

/** The cards: approved photos of other members, one at a time. */
export default async function SwipeDeckPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  await requireUser(locale, `/${locale}/swipe/deck`);
  const status = await getSwipeStatus();
  const gate = await SwipeGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Swipe.deck' });
  const cards = await getSwipeDeck();

  return (
    <>
      <h1 className={styles.srOnly}>{t('title')}</h1>
      <SwipeDeck
        locale={locale}
        initial={cards}
        vote={voteAction}
        undo={undoAction}
        more={deckAction}
        report={reportAction}
        canUpload={status.canUpload}
        superLikesLeft={status.superLikesLeft}
        blur={status.profile?.blurPhotos ?? false}
      />
    </>
  );
}
