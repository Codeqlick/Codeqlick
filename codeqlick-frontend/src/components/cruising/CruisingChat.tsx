'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { SendMessageResult } from '@/app/[locale]/cruising/actions';
import {
  LIMITS,
  mergeMessages,
  POLL_MS,
  SAFE_CHAT_MESSAGES,
  type CruisingMessage,
} from '@/lib/cruising';
import styles from './Cruising.module.css';

type CruisingChatProps = {
  locale: string;
  conversationId: string;
  partner: string;
  initial: CruisingMessage[];
  /** The route handler the chat asks for new messages (never the API). */
  pollUrl: string;
  send: (conversationId: string, text: string) => Promise<SendMessageResult>;
};

/** A text chat between two members. New messages arrive by asking every few seconds. */
export function CruisingChat({
  locale,
  conversationId,
  partner,
  initial,
  pollUrl,
  send,
}: CruisingChatProps) {
  const t = useTranslations('Cruising.chat');
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();
  const list = useRef<HTMLOListElement>(null);
  const last = messages.at(-1)?.createdAt;

  useEffect(() => {
    if (gone) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const url = last ? `${pollUrl}?after=${encodeURIComponent(last)}` : pollUrl;
      void fetch(url, { cache: 'no-store' })
        .then(async (response) => {
          if (response.status === 404) {
            setGone(true);
            return;
          }
          if (!response.ok) return;
          const body = (await response.json()) as { items?: CruisingMessage[] };
          const items = body.items ?? [];
          if (items.length > 0) setMessages((current) => mergeMessages(current, items));
        })
        .catch(() => {
          // Offline or a hiccup: the next round asks again.
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pollUrl, last, gone]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    startTransition(async () => {
      const result = await send(conversationId, clean);
      if (result.ok) {
        setText('');
        setError(null);
        setMessages((current) => mergeMessages(current, [result.message]));
      } else if (result.reason === 'contact') {
        setError(t('contactBlocked', { count: SAFE_CHAT_MESSAGES }));
      } else if (result.reason === 'rate') {
        setError(t('rateLimited'));
      } else if (result.reason === 'gone') {
        setGone(true);
      } else {
        setError(t('sendError'));
      }
    });
  }

  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  return (
    <div className={styles.chat}>
      {gone ? <p className={styles.notice}>{t('gone')}</p> : null}
      <ol
        ref={list}
        className={styles.chatMessages}
        aria-label={t('listLabel', { nickname: partner })}
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <li className={styles.muted}>{t('empty', { nickname: partner })}</li>
        ) : null}
        {messages.map((message) => (
          <li key={message.id} className={message.mine ? styles.mine : styles.theirs}>
            <span className={styles.bubble}>{message.text}</span>
            <time className={styles.time} dateTime={message.createdAt}>
              {time(message.createdAt)}
            </time>
          </li>
        ))}
      </ol>
      <form className={styles.compose} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor="cruising-message">
          {t('label')}
        </label>
        <input
          id="cruising-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={LIMITS.message}
          placeholder={t('placeholder')}
          autoComplete="off"
          disabled={gone}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={pending || gone || !text.trim()}
        >
          {t('send')}
        </button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.muted}>{t('safety')}</p>
      <p className={styles.muted}>{t('guard', { count: SAFE_CHAT_MESSAGES })}</p>
    </div>
  );
}
