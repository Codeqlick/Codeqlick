'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import {
  EXOCLICK_SCRIPT,
  EXOCLICK_TAG_CLASS,
  SWIPE_AD_ZONES,
  VIDEOCHAT_AD_ZONES,
  type SwipeAdZone,
  type VideochatAdZone,
} from '@/lib/videochat-ads';
import styles from './AdZone.module.css';

declare global {
  interface Window {
    /** ExoClick's command queue (an array until the loader replaces it). */
    AdProvider?: { push: (command: unknown) => void };
  }
}

const SCRIPT_ID = 'exoclick-ad-provider';

type AdZoneProps = { className?: string } & (
  { app?: 'videochat'; zone: VideochatAdZone } | { app: 'swipe'; zone: SwipeAdZone }
);

/**
 * One ExoClick zone (architecture 4.7, 4.10): a labelled 300x250 box. The loader is added once per
 * page; each mount asks it to fill the zones on the page, so client-side navigation refills them
 * too. Renders nothing while the zone has no ID.
 */
export function AdZone(props: AdZoneProps) {
  const { className } = props;
  const t = useTranslations('Videochat');
  const zoneId =
    props.app === 'swipe' ? SWIPE_AD_ZONES[props.zone] : VIDEOCHAT_AD_ZONES[props.zone];

  useEffect(() => {
    if (!zoneId) return;
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.type = 'application/javascript';
      script.src = EXOCLICK_SCRIPT;
      document.body.appendChild(script);
    }
    const queue: { push: (command: unknown) => void } = window.AdProvider ?? ([] as unknown[]);
    window.AdProvider = queue;
    queue.push({ serve: {} });
  }, [zoneId]);

  if (!zoneId) return null;
  return (
    <aside
      className={className ? `${styles.ad} ${className}` : styles.ad}
      aria-label={t('adLabel')}
    >
      <span className={styles.label}>{t('adLabel')}</span>
      <ins className={EXOCLICK_TAG_CLASS} data-zoneid={zoneId} />
    </aside>
  );
}
