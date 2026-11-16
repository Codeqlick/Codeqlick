'use client';

import type { ReactNode } from 'react';
import styles from './CruisingMedia.module.css';

type MediaTileProps = {
  kind: 'PHOTO' | 'VIDEO';
  src: string;
  /** A video's still image. */
  poster?: string;
  alt: string;
  /** `@nickname · cruising.codeqlick.com`, over the picture. */
  watermark: string;
  refLabel: string;
  /** The "Report" form, rendered by the page. */
  children?: ReactNode;
};

/**
 * One photo or video of a profile, with a watermark over it. It makes saving it a little harder
 * (no dragging, no context menu, no download button, no picture-in-picture): that deters casual
 * copying, it can't stop a screenshot. Videos start muted, on tap, and load nothing before that.
 */
export function MediaTile({
  kind,
  src,
  poster,
  alt,
  watermark,
  refLabel,
  children,
}: MediaTileProps) {
  return (
    <li className={styles.tile}>
      {/* The context menu is where "Save as" lives: it is cancelled for the whole frame. */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className={styles.frame} onContextMenu={(event) => event.preventDefault()}>
        {kind === 'VIDEO' ? (
          <video
            className={styles.media}
            src={src}
            poster={poster}
            muted
            playsInline
            controls
            preload="none"
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            disableRemotePlayback
            aria-label={alt}
          />
        ) : (
          // A private image through the BFF route: next/image can't optimise it.
          // oxlint-disable-next-line nextjs/no-img-element
          <img className={styles.media} src={src} alt={alt} loading="lazy" draggable={false} />
        )}
        <span className={styles.watermark} aria-hidden="true">
          {watermark}
        </span>
      </div>
      <div className={styles.refLine}>
        <span>{refLabel}</span>
        {children}
      </div>
    </li>
  );
}
