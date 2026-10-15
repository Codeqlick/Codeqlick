import Image from 'next/image';
import { env } from '@/lib/env';
import { localMediaPath } from '@/lib/media-path';

/** Widths the cover is shown at: a card in the list grids, or the article hero (48rem column). */
const SIZES = {
  card: '(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 25rem',
  hero: '(max-width: 48rem) 100vw, 48rem',
} as const;

/**
 * A post or case study cover. Our own uploads are resized and re-encoded (WebP) by the Next.js
 * image optimizer for the width they are shown at; any other URL is shown as it is.
 */
export function CoverImage({
  src,
  className,
  variant,
  priority = false,
}: {
  src: string;
  className: string;
  variant: keyof typeof SIZES;
  /** On screen when the page opens: the page's largest paint, so load it now. */
  priority?: boolean;
}) {
  const local = localMediaPath(src, env.SITE_URL);
  if (local) {
    return (
      <Image
        src={local}
        alt=""
        // Covers are 16:9 (the CSS crops them to it); these only set the intrinsic ratio.
        width={1600}
        height={900}
        sizes={SIZES[variant]}
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary remote URLs
    <img
      src={src}
      alt=""
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
    />
  );
}
