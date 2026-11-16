'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { deleteMediaAction, updateMediaAction } from '@/app/[locale]/cruising/actions';
import { compressPhoto } from '@/components/swipe/compress';
import {
  canAddMedia,
  hasProcessing,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MEDIA_POLL_MS,
  mediaCounts,
  mediaErrorKey,
  mediaFailureKey,
  mediaFileEndpoint,
  mediaKindOf,
  mediaPosterEndpoint,
  mediaUploadEndpoint,
  movedPosition,
  type MediaLimits,
  type MyMedia,
} from '@/lib/cruising-media';
import type { AppLocale } from '@/i18n/routing';
import styles from './CruisingMedia.module.css';
import { readVideoDuration, uploadWithProgress } from './upload';

type MediaManagerProps = {
  locale: AppLocale;
  onHost: boolean;
  items: MyMedia[];
  limits: MediaLimits;
};

/**
 * My photos and videos: upload (with the consent each time and a progress bar), status, order,
 * cover and delete. While something is processing the page asks again every few seconds.
 */
export function MediaManager({ locale, onHost, items, limits }: MediaManagerProps) {
  const t = useTranslations('Cruising.media');
  const router = useRouter();
  const fileId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = mediaCounts(items);
  const processing = hasProcessing(items);
  const uploading = progress !== null;
  const kind = file ? mediaKindOf(file) : null;
  const full = kind !== null && !canAddMedia(kind, counts, limits);

  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => router.refresh(), MEDIA_POLL_MS);
    return () => clearInterval(timer);
  }, [processing, router]);

  function pick(chosen: File | undefined) {
    setMessage(null);
    setFile(chosen ?? null);
  }

  async function upload() {
    if (!file || !kind) {
      setMessage({ ok: false, text: t('errors.invalid') });
      return;
    }
    setMessage(null);
    setProgress(0);
    try {
      let toSend: File = file;
      if (kind === 'PHOTO') {
        if (file.size > MAX_PHOTO_BYTES * 3) {
          setMessage({ ok: false, text: t('errors.tooLarge') });
          return;
        }
        try {
          toSend = await compressPhoto(file);
        } catch {
          setMessage({ ok: false, text: t('errors.invalid') });
          return;
        }
      } else {
        if (file.size > MAX_VIDEO_BYTES) {
          setMessage({ ok: false, text: t('errors.tooLarge') });
          return;
        }
        const seconds = await readVideoDuration(file);
        if (seconds !== null && seconds > MAX_VIDEO_SECONDS) {
          setMessage({ ok: false, text: t('errors.tooLong') });
          return;
        }
      }
      const form = new FormData();
      form.set('consent', 'true');
      form.set('file', toSend, toSend.name);
      const { status } = await uploadWithProgress(mediaUploadEndpoint(locale), form, setProgress);
      if (status >= 200 && status < 300) {
        setMessage({ ok: true, text: t(kind === 'VIDEO' ? 'sentVideo' : 'sentPhoto') });
        setFile(null);
        setConsent(false);
        if (input.current) input.current.value = '';
        router.refresh();
      } else {
        setMessage({ ok: false, text: t(`errors.${mediaErrorKey(status)}`) });
      }
    } finally {
      setProgress(null);
    }
  }

  function change(run: () => ReturnType<typeof updateMediaAction>) {
    setMessage(null);
    startTransition(async () => {
      const result = await run();
      if (result.ok) router.refresh();
      else setMessage({ ok: false, text: result.message });
    });
  }

  const percent = Math.round((progress ?? 0) * 100);

  return (
    <div className={styles.state}>
      <p className={styles.counts}>
        <span>{t('photosCount', { count: counts.photos, max: limits.photos })}</span>
        <span>{t('videosCount', { count: counts.videos, max: limits.videos })}</span>
        <span>{t('perDay', { max: limits.perDay })}</span>
      </p>

      <div className={styles.upload}>
        <label htmlFor={fileId} className={styles.fieldLabel}>
          {t('fileLabel')}
        </label>
        <input
          ref={input}
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          onChange={(event) => pick(event.target.files?.[0])}
          className={styles.file}
          disabled={uploading}
          aria-describedby={`${fileId}-hint`}
        />
        <p id={`${fileId}-hint`} className={styles.counts}>
          {t('fileHint', { seconds: MAX_VIDEO_SECONDS })}
        </p>
        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            required
          />
          <span>{t('consent')}</span>
        </label>
        {full ? <p className={styles.error}>{t('errors.limit')}</p> : null}
        <button
          type="button"
          className={styles.send}
          onClick={() => void upload()}
          disabled={!file || !consent || uploading || full}
        >
          {uploading ? t('sending') : t('send')}
        </button>
        {uploading ? (
          <div>
            <progress
              className={styles.progress}
              value={percent}
              max={100}
              aria-label={t('progress')}
            />
            <span>{t('percent', { percent })}</span>
          </div>
        ) : null}
        {message ? (
          <output className={message.ok ? styles.ok : styles.error}>{message.text}</output>
        ) : null}
      </div>

      {items.length === 0 ? <p className={styles.empty}>{t('empty')}</p> : null}
      <ul className={styles.items} aria-label={t('listLabel')}>
        {items.map((item, index) => {
          const up = movedPosition(items, item.id, -1);
          const down = movedPosition(items, item.id, 1);
          const thumb =
            item.status === 'LIVE' || item.status === 'HIDDEN'
              ? item.kind === 'VIDEO'
                ? mediaPosterEndpoint(locale, onHost, item.id)
                : mediaFileEndpoint(locale, onHost, item.id)
              : null;
          return (
            <li key={item.id} className={styles.item}>
              <div className={styles.thumb}>
                {thumb ? (
                  // A private image through the BFF route: next/image can't optimise it.
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img src={thumb} alt="" loading="lazy" draggable={false} />
                ) : (
                  <span>{t(`kind.${item.kind}`)}</span>
                )}
              </div>
              <div className={styles.itemBody}>
                <p>
                  <strong>{t(`kind.${item.kind}`)}</strong> ·{' '}
                  <span
                    className={
                      item.status === 'LIVE'
                        ? `${styles.status} ${styles.statusLive}`
                        : styles.status
                    }
                  >
                    {t(`status.${item.status}`)}
                  </span>
                  {item.cover ? ` · ${t('cover')}` : ''}
                </p>
                <p className={styles.counts}>
                  <span>{t('ref', { ref: item.ref })}</span>
                  {item.durationSeconds !== null ? (
                    <span>{t('duration', { seconds: Math.round(item.durationSeconds) })}</span>
                  ) : null}
                </p>
                <p className={styles.counts}>{t(`explain.${item.status}`)}</p>
                {item.status === 'FAILED' ? (
                  <p className={styles.error}>{t(`failures.${mediaFailureKey(item.failure)}`)}</p>
                ) : null}
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.small}
                    disabled={pending || up === null}
                    onClick={() =>
                      up !== null &&
                      change(() => updateMediaAction(locale, item.id, { position: up }))
                    }
                    aria-label={t('moveUpFor', { number: index + 1 })}
                  >
                    {t('moveUp')}
                  </button>
                  <button
                    type="button"
                    className={styles.small}
                    disabled={pending || down === null}
                    onClick={() =>
                      down !== null &&
                      change(() => updateMediaAction(locale, item.id, { position: down }))
                    }
                    aria-label={t('moveDownFor', { number: index + 1 })}
                  >
                    {t('moveDown')}
                  </button>
                  {item.kind === 'PHOTO' && item.status === 'LIVE' && !item.cover ? (
                    <button
                      type="button"
                      className={styles.small}
                      disabled={pending}
                      onClick={() =>
                        change(() => updateMediaAction(locale, item.id, { cover: true }))
                      }
                    >
                      {t('makeCover')}
                    </button>
                  ) : null}
                  {confirming === item.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.small}
                        disabled={pending}
                        onClick={() => {
                          setConfirming(null);
                          change(() => deleteMediaAction(locale, item.id));
                        }}
                      >
                        {t('deleteConfirm')}
                      </button>
                      <button
                        type="button"
                        className={styles.small}
                        onClick={() => setConfirming(null)}
                      >
                        {t('cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.small}
                      disabled={pending}
                      onClick={() => setConfirming(item.id)}
                    >
                      {t('delete')}
                    </button>
                  )}
                </div>
                {confirming === item.id ? (
                  <p className={styles.counts} role="alert">
                    {t('deleteLead')}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
