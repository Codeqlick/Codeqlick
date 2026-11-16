import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingMemberMedia } from '@/lib/api/cruising';
import { mediaFileEndpoint, mediaPosterEndpoint, watermarkText } from '@/lib/cruising-media';
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
};

/** The photos and videos of a profile, each with its reference, its watermark and a "Report". */
export async function MemberGallery({ locale, nickname, items, own }: MemberGalleryProps) {
  if (items.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'Cruising.gallery' });
  const onHost = (await requestWebapp()) === 'cruising';
  return (
    <section aria-labelledby="gallery-title">
      <h2 id="gallery-title" className={styles.srOnly}>
        {t('title')}
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
