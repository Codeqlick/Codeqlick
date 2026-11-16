import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingMemberMedia } from '@/lib/api/cruising';
import {
  mediaFileEndpoint,
  mediaPosterEndpoint,
  watermarkText,
  type MediaAlbum,
} from '@/lib/cruising-media';
import { requestWebapp } from '@/lib/webapp-request';
import styles from './CruisingMedia.module.css';
import { MediaTile } from './MediaTile';
import { ReportDetails } from './ReportDetails';

type MemberGalleryProps = {
  locale: AppLocale;
  nickname: string;
  items: CruisingMemberMedia[];
  /** Mine: nothing to report. */
  own: boolean;
  /** Which album to show (the profile's public one by default); items of the other are skipped. */
  album?: MediaAlbum;
  /** Hides the heading's own text from sighted readers when a parent already names the section. */
  headingId?: string;
};

/**
 * The photos and videos of a profile's album, each with its reference, its watermark and a
 * "Report". The private album is only ever given to the member it was shared with.
 */
export async function MemberGallery({
  locale,
  nickname,
  items: all,
  own,
  album = 'PUBLIC',
  headingId = `gallery-title-${album.toLowerCase()}`,
}: MemberGalleryProps) {
  const items = all.filter((item) => (item.album ?? 'PUBLIC') === album);
  if (items.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'Cruising.gallery' });
  const onHost = (await requestWebapp()) === 'cruising';
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={album === 'PRIVATE' ? styles.galleryTitle : styles.srOnly}>
        {t(album === 'PRIVATE' ? 'privateTitle' : 'title', { nickname })}
      </h2>
      <ul className={styles.gallery}>
        {items.map((item, index) => (
          <MediaTile
            key={item.id}
            kind={item.kind}
            src={mediaFileEndpoint(locale, onHost, item.id)}
            poster={
              item.kind === 'VIDEO' ? mediaPosterEndpoint(locale, onHost, item.id) : undefined
            }
            alt={t(item.kind === 'VIDEO' ? 'videoAlt' : 'photoAlt', {
              nickname,
              number: index + 1,
            })}
            watermark={watermarkText(nickname)}
            refLabel={t('ref', { ref: item.ref })}
          >
            {own ? null : <ReportDetails locale={locale} kind="media" id={item.id} />}
          </MediaTile>
        ))}
      </ul>
    </section>
  );
}
