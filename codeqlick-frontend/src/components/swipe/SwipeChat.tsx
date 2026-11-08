'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { SwipeMessage } from '@/lib/api/swipe';
import { mergeMessages, POLL_MS, SAFE_CHAT_MESSAGES } from './logic';
import { ReportForm } from './ReportForm';
import styles from './Swipe.module.css';

type SwipeChatProps = {
  locale: string;
  matchId: string;
  nickname: string;
  /** The partner's sentence, under their name. */
  bio: string | null;
  initial: SwipeMessage[];
  load: (
    matchId: string,
    after?: string,
  ) => Promise<{ ok: true; items: SwipeMessage[] } | { ok: false; gone: boolean }>;
  send: (
    matchId: string,
    text: string,
  ) => Promise<{ ok: true; message: SwipeMessage } | { ok: false; contactBlocked?: boolean }>;
  end: (matchId: string, block: boolean) => Promise<{ ok: boolean }>;
  report: (input: {
    matchId: string;
    reason: string;
    details?: string;
  }) => Promise<{ ok: boolean }>;
};

/** A text chat between two matches. New messages arrive by asking every few seconds. */
export function SwipeChat({
  locale,
  matchId,
  nickname,
  bio,
  initial,
  load,
  send,
  end,
  report,
}: SwipeChatProps) {
  const t = useTranslations('Swipe.chat');
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [menu, setMenu] = useState<'none' | 'end' | 'report'>('none');
  const [pending, startTransition] = useTransition();
  const list = useRef<HTMLOListElement>(null);
  const last = messages.at(-1)?.createdAt;

  useEffect(() => {
    if (gone) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load(matchId, last).then((result) => {
        if (result.ok) {
          if (result.items.length > 0)
            setMessages((current) => mergeMessages(current, result.items));
        } else if (result.gone) {
          setGone(true);
        }
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, matchId, last, gone]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    startTransition(async () => {
      const result = await send(matchId, clean);
      if (result.ok) {
        setText('');
        setError(null);
        setMessages((current) => mergeMessages(current, [result.message]));
      } else {
        setError(
          result.contactBlocked
            ? t('contactBlocked', { count: SAFE_CHAT_MESSAGES })
            : t('sendError'),
        );
      }
    });
  }

  function finish(block: boolean) {
    startTransition(async () => {
      const result = await end(matchId, block);
      if (result.ok) router.push('/swipe/matches');
      else setError(t('error'));
    });
  }

  async function sendReport(reason: string, details: string) {
    const result = await report({ matchId, reason, details });
    if (result.ok) router.push('/swipe/matches');
    else setError(t('error'));
  }

  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  return (
    <div className={styles.chat}>
      <div className={styles.chatHeader}>
        <div>
          <h1 className={styles.chatTitle}>{nickname}</h1>
          {bio ? <p className={styles.hint}>{bio}</p> : null}
        </div>
        <div className={styles.matchActions}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => setMenu(menu === 'end' ? 'none' : 'end')}
          >
            {t('endMenu')}
          </button>
          <button
            type="button"
            className={styles.reportLink}
            onClick={() => setMenu(menu === 'report' ? 'none' : 'report')}
          >
            {t('report')}
          </button>
        </div>
      </div>
      {menu === 'end' ? (
        <div className={styles.confirm}>
          <p>{t('endLead', { nickname })}</p>
          <div className={styles.matchActions}>
            <button
              type="button"
              className={styles.ghost}
              disabled={pending}
              onClick={() => finish(false)}
            >
              {t('unmatch')}
            </button>
            <button
              type="button"
              className={styles.danger}
              disabled={pending}
              onClick={() => finish(true)}
            >
              {t('block')}
            </button>
          </div>
        </div>
      ) : null}
      {menu === 'report' ? (
        <ReportForm
          onSend={sendReport}
          onCancel={() => setMenu('none')}
          reasons={['MINOR', 'HARASSMENT', 'NON_CONSENSUAL', 'ILLEGAL', 'SPAM', 'OTHER']}
        />
      ) : null}
      {gone ? <p className={styles.notice}>{t('gone')}</p> : null}
      <ol ref={list} className={styles.messages} aria-live="polite">
        {messages.length === 0 ? <li className={styles.hint}>{t('empty', { nickname })}</li> : null}
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
        <label className={styles.srOnly} htmlFor="swipe-message">
          {t('label')}
        </label>
        <input
          id="swipe-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          placeholder={t('placeholder')}
          autoComplete="off"
          disabled={gone}
        />
        <button type="submit" className={styles.primary} disabled={pending || gone || !text.trim()}>
          {t('send')}
        </button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.hint}>{t('safety')}</p>
      <p className={styles.guard}>{t('guard', { count: SAFE_CHAT_MESSAGES })}</p>
    </div>
  );
}
