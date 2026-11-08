'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Link } from '@/i18n/navigation';
import type { VoteResult } from '@/app/[locale]/swipe/actions';
import type { SwipeCard } from '@/lib/api/swipe';
import { dragVote, mergeCards } from './logic';
import { ReportForm } from './ReportForm';
import styles from './Swipe.module.css';

type SwipeDeckProps = {
  locale: string;
  initial: SwipeCard[];
  vote: (photoId: string, like: boolean, superLike?: boolean) => Promise<VoteResult>;
  undo: () => Promise<{ ok: true; card: SwipeCard } | { ok: false }>;
  more: () => Promise<SwipeCard[]>;
  report: (input: {
    photoId: string;
    reason: string;
    details?: string;
  }) => Promise<{ ok: boolean }>;
  canUpload: boolean;
  /** "Love" left today. */
  superLikesLeft: number;
  /** Photos start blurred until tapped (profile setting). */
  blur: boolean;
};

/**
 * The stack of photos: drag, the buttons or the arrow keys like (→) or skip (←); ↑ gives a
 * "love" and the undo button brings the last card back (architecture 4.10).
 */
export function SwipeDeck({
  locale,
  initial,
  vote,
  undo,
  more,
  report,
  canUpload,
  superLikesLeft,
  blur,
}: SwipeDeckProps) {
  const t = useTranslations('Swipe.deck');
  const tg = useTranslations('Swipe.genders');
  const ti = useTranslations('Videochat.interests');
  const [cards, setCards] = useState(initial);
  const [dx, setDx] = useState(0);
  const [match, setMatch] = useState<{ id: string; nickname: string } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(initial.length === 0);
  const [loves, setLoves] = useState(superLikesLeft);
  const [canUndo, setCanUndo] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const seen = useRef(new Set<string>());
  const drag = useRef<{ x: number; id: number } | null>(null);
  const loading = useRef(false);
  const card = cards[0];

  const refill = useCallback(() => {
    if (loading.current || exhausted) return;
    loading.current = true;
    void more().then((items) => {
      loading.current = false;
      setCards((current) => {
        const next = mergeCards(current, items, seen.current);
        if (next.length === current.length) setExhausted(true);
        return next;
      });
    });
  }, [more, exhausted]);

  useEffect(() => {
    if (cards.length < 3) refill();
  }, [cards.length, refill]);

  const next = useCallback(() => {
    setDx(0);
    setReporting(false);
    setCards((current) => {
      if (current[0]) seen.current.add(current[0].id);
      return current.slice(1);
    });
  }, []);

  const decide = useCallback(
    (like: boolean, superLike = false) => {
      if (!card) return;
      if (superLike && loves <= 0) {
        setNotice(t('noLovesLeft'));
        return;
      }
      const id = card.id;
      next();
      setNotice(null);
      if (superLike) setLoves((left) => left - 1);
      startTransition(async () => {
        const result = await vote(id, like, superLike);
        if (!result.ok) {
          setCanUndo(false);
          if (superLike) setLoves(result.noLovesLeft ? 0 : (left) => left + 1);
          setNotice(result.noLovesLeft ? t('noLovesLeft') : t('voteError'));
          return;
        }
        setCanUndo(!result.match);
        if (result.match) setMatch(result.match);
      });
    },
    [card, loves, next, vote, t],
  );

  const takeBack = useCallback(() => {
    setCanUndo(false);
    startTransition(async () => {
      const result = await undo();
      if (!result.ok) {
        setNotice(t('undoError'));
        return;
      }
      setNotice(null);
      seen.current.delete(result.card.id);
      setExhausted(false);
      setCards((current) => [result.card, ...current.filter((c) => c.id !== result.card.id)]);
    });
  }, [undo, t]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (reporting || target?.closest('input, textarea, select')) return;
      if (event.key === 'ArrowRight') decide(true);
      if (event.key === 'ArrowLeft') decide(false);
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        decide(true, true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, reporting]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button')) return;
    drag.current = { x: event.clientX, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === event.pointerId) setDx(event.clientX - drag.current.x);
  }
  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    const verdict = dragVote(dx);
    if (verdict) decide(verdict === 'like');
    else setDx(0);
  }

  async function sendReport(reason: string, details: string) {
    if (!card) return;
    const result = await report({ photoId: card.id, reason, details });
    if (result.ok) {
      setNotice(t('reported'));
      next();
    } else {
      setNotice(t('reportError'));
    }
  }

  const verdict = dragVote(dx);
  const blurred = blur && card !== undefined && revealed !== card.id;

  return (
    <div className={styles.deck}>
      {match ? (
        <output className={styles.match}>
          <strong>{t('matchTitle', { nickname: match.nickname })}</strong>
          <span>{t('matchBody')}</span>
          <div className={styles.matchActions}>
            <Link href={`/swipe/matches/${match.id}`} className={styles.primary}>
              {t('matchChat')}
            </Link>
            <button type="button" className={styles.ghost} onClick={() => setMatch(null)}>
              {t('matchKeep')}
            </button>
          </div>
        </output>
      ) : null}

      {card ? (
        <div
          key={card.id}
          className={styles.card}
          style={{ transform: `translateX(${dx}px) rotate(${dx / 20}deg)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setDx(0);
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className={styles.photoFrame}
            style={{ aspectRatio: `${card.width} / ${card.height}` }}
          >
            {/* Private image through this site's route (BFF): next/image can't fetch it. */}
            {/* oxlint-disable-next-line nextjs/no-img-element */}
            <img
              src={`/${locale}/swipe/img/${card.id}`}
              alt={t('photoAlt', { nickname: card.nickname })}
              className={`${styles.photo} ${blurred ? styles.blurred : ''}`}
              draggable={false}
            />
            {blurred ? (
              <button type="button" className={styles.reveal} onClick={() => setRevealed(card.id)}>
                {t('reveal')}
              </button>
            ) : null}
            {card.lovesYou ? <span className={styles.lovesYou}>{t('lovesYou')}</span> : null}
            {verdict ? (
              <span
                className={verdict === 'like' ? styles.stampLike : styles.stampSkip}
                aria-hidden="true"
              >
                {verdict === 'like' ? t('like') : t('skip')}
              </span>
            ) : null}
          </div>
          <div className={styles.cardInfo}>
            <p className={styles.nickname}>
              {card.nickname}
              {card.gender ? <span className={styles.gender}> · {tg(card.gender)}</span> : null}
            </p>
            {card.bio ? <p className={styles.bio}>{card.bio}</p> : null}
            {card.interests.length > 0 ? (
              <ul className={styles.chips}>
                {card.interests.map((interest) => (
                  <li key={interest}>{ti(interest)}</li>
                ))}
              </ul>
            ) : null}
            <p className={styles.ref}>
              {t('ref')} <code>{card.ref}</code>
            </p>
          </div>
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.skip}
              onClick={() => decide(false)}
              aria-label={t('skip')}
            >
              ✕
            </button>
            <button
              type="button"
              className={styles.undo}
              onClick={takeBack}
              disabled={!canUndo}
              aria-label={t('undo')}
              title={t('undo')}
            >
              ↺
            </button>
            <button
              type="button"
              className={styles.love}
              onClick={() => decide(true, true)}
              disabled={loves <= 0}
              aria-label={t('love', { count: loves })}
              title={t('love', { count: loves })}
            >
              ★
            </button>
            <button
              type="button"
              className={styles.like}
              onClick={() => decide(true)}
              aria-label={t('like')}
            >
              ♥
            </button>
          </div>
          <button
            type="button"
            className={styles.reportLink}
            onClick={() => setReporting((open) => !open)}
          >
            {t('report')}
          </button>
          {reporting ? (
            <ReportForm onSend={sendReport} onCancel={() => setReporting(false)} />
          ) : null}
        </div>
      ) : (
        <div className={styles.empty}>
          <p>{exhausted ? t('empty') : t('loading')}</p>
          {canUndo ? (
            <button type="button" className={styles.ghost} onClick={takeBack}>
              {t('undo')}
            </button>
          ) : null}
          {canUpload ? null : (
            <Link href="/swipe/photos" className={styles.inlineLink}>
              {t('shareYours')}
            </Link>
          )}
        </div>
      )}
      {notice ? <output className={styles.notice}>{notice}</output> : null}
      <p className={styles.keysHint}>{t('keysHint')}</p>
    </div>
  );
}
