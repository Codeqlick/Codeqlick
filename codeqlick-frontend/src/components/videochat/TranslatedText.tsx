'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import styles from './VideochatRoom.module.css';

/** A chat message, translated when there is a translation, with a switch to the original. */
export function TranslatedText({ text, translated }: { text: string; translated?: string }) {
  const t = useTranslations('Videochat.room');
  const [original, setOriginal] = useState(false);
  if (!translated) return <>{text}</>;
  return (
    <>
      {original ? text : translated}{' '}
      <button type="button" className={styles.original} onClick={() => setOriginal(!original)}>
        {original ? t('seeTranslation') : t('seeOriginal')}
      </button>
    </>
  );
}
