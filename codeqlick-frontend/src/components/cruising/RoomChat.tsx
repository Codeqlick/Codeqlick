'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { RoomSendResult } from '@/app/[locale]/cruising/room-actions';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { memberHref } from '@/lib/cruising';
import {
  mergeRoomMessages,
  postingRefusalKey,
  readRoomSnapshot,
  ROOM_MESSAGE_MAX,
  ROOM_POLL_MS,
  roomCounter,
  trimRoomMessages,
  type RoomMessage,
  type RoomPosting,
} from '@/lib/cruising-rooms';
import chat from './Cruising.module.css';
import { RoomReport } from './RoomReport';
import styles from './CruisingRooms.module.css';
import { VerifiedBadge } from './VerifiedBadge';

type RoomChatProps = {
  locale: AppLocale;
  city: string;
  initial: RoomMessage[];
  initialPosting: RoomPosting;
  /** The route handler the room asks for new messages (never the API). */
  pollUrl: string;
  send: (text: string) => Promise<RoomSendResult>;
};

/**
 * A city's room: messages from members who entered, new ones by asking every 5 seconds while the
 * tab is visible, a composer with a live character counter and, when I can't post, why not.
 */
export function RoomChat({ locale, city, initial, initialPosting, pollUrl, send }: RoomChatProps) {
  const t = useTranslations('Cruising.rooms');
  const tv = useTranslations('Cruising.verified');
  const [messages, setMessages] = useState(initial);
  const [posting, setPosting] = useState(initialPosting);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();
  const list = useRef<HTMLOListElement>(null);
  const last = messages.at(-1)?.at;

  useEffect(() => {
    if (gone) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const url = last ? `${pollUrl}?after=${encodeURIComponent(last)}` : pollUrl;
      void fetch(url, { cache: 'no-store' })
        .then(async (response) => {
          if (response.status === 404 || response.status === 403) {
            setGone(true);
            return;
          }
          if (!response.ok) return;
          const snapshot = readRoomSnapshot(await response.json());
          if (!snapshot) return;
          setPosting(snapshot.posting);
          if (snapshot.items.length > 0) {
            setMessages((current) => trimRoomMessages(mergeRoomMessages(current, snapshot.items)));
          }
        })
        .catch(() => {
          // Offline or a hiccup: the next round asks again.
        });
    }, ROOM_POLL_MS);
    return () => clearInterval(timer);
  }, [pollUrl, last, gone]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const refusal = postingRefusalKey(posting);
  const counter = roomCounter(text);
  const canPost = !gone && refusal === null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || counter.over || !canPost) return;
    startTransition(async () => {
      const result = await send(clean);
      if (result.ok) {
        setText('');
        setError(null);
        setMessages((current) => trimRoomMessages(mergeRoomMessages(current, [result.message])));
      } else if (result.reason === 'contact') {
        setError(t('errors.contact'));
      } else if (result.reason === 'gone') {
        setGone(true);
      } else {
        setError(t(`errors.${result.reason}`));
      }
    });
  }

  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  return (
    <div className={styles.room}>
      {gone ? <p className={styles.notice}>{t('gone')}</p> : null}
      <ol
        ref={list}
        className={styles.messages}
        aria-label={t('listLabel', { city })}
        aria-live="polite"
      >
        {messages.length === 0 ? <li className={chat.muted}>{t('empty', { city })}</li> : null}
        {messages.map((message) => (
          <li key={message.id} className={`${styles.message} ${message.mine ? styles.mine : ''}`}>
            <div className={styles.head}>
              {message.mine ? (
                <span className={styles.author}>{t('you')}</span>
              ) : (
                <Link href={memberHref(message.nickname)} className={styles.author}>
                  {message.nickname}
                </Link>
              )}
              {message.verified ? <VerifiedBadge label={tv('label')} help={tv('help')} /> : null}
              <time dateTime={message.at}>{time(message.at)}</time>
            </div>
            <p className={styles.text}>{message.text}</p>
            {message.mine ? null : <RoomReport locale={locale} messageId={message.id} />}
          </li>
        ))}
      </ol>

      {refusal ? (
        <output className={styles.notice}>
          {refusal === 'muted' && posting.until
            ? t('refusal.mutedUntil', { date: date(posting.until) })
            : t(`refusal.${refusal}`)}
        </output>
      ) : null}

      <form className={chat.compose} onSubmit={submit}>
        <label className={chat.srOnly} htmlFor="room-message">
          {t('label')}
        </label>
        <input
          id="room-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={ROOM_MESSAGE_MAX}
          placeholder={t('placeholder', { city })}
          autoComplete="off"
          disabled={!canPost}
          aria-describedby="room-counter room-rules"
        />
        <button
          type="submit"
          className={chat.sendButton}
          disabled={pending || !canPost || !text.trim() || counter.over}
        >
          {t('send')}
        </button>
      </form>
      <p
        id="room-counter"
        className={`${styles.counter} ${counter.remaining <= 20 ? styles.counterOver : ''}`}
      >
        {t('counter', { count: counter.length, max: ROOM_MESSAGE_MAX })}
      </p>
      {error ? (
        <p className={chat.error} role="alert">
          {error}
        </p>
      ) : null}
      <p id="room-rules" className={chat.muted}>
        {t('rules')}
      </p>
    </div>
  );
}
