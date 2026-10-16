import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { getPreviewStatus } from '@/lib/api/site-requests';
import home from '../../../../page.module.css';
import styles from '../../request.module.css';

type PageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  return { title: t('previewWaitTitle'), robots: { index: false, follow: false } };
}

/**
 * Where "Ver mi vista previa" leads (architecture 8.2): the preview's own address only works once
 * the host publishes it over HTTPS, so this waits for it and then sends the visitor there.
 */
export default async function PreviewWaitPage({ params }: PageProps) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  const preview = /^[a-z0-9-]{1,40}$/.test(slug) ? await getPreviewStatus(slug) : null;
  if (preview?.status === 'READY') redirect(preview.url);
  const building = preview?.status === 'BUILDING';

  return (
    <section className={`wrap ${styles.page}`}>
      <div className={home.intro}>
        <p className="eyebrow">{t('eyebrow')}</p>
        <h1 className={home.title}>{building ? t('previewWaitTitle') : t('previewGoneTitle')}</h1>
        <p className={home.lead}>{building ? t('previewWaitBody') : t('previewGoneBody')}</p>
        {building ? <AutoRefresh seconds={10} /> : null}
        <p>
          <Button href="/basic-website" variant="outline">
            {t('back')}
          </Button>
        </p>
      </div>
    </section>
  );
}
