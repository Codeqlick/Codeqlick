import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SiteEditorShell } from '@/components/editor/SiteEditorShell';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { NEWS_PAGE_SIZE } from '@/components/editor/news';
import { getMySite, getSiteEditor } from '@/lib/api/portal-site';
import { listSiteNews } from '@/lib/api/site-news';
import { webappUrl } from '@/lib/webapp-seo';

/** The website editor (architecture 8.2, decision 18): everything of the site, on a draft. */
export default async function SiteEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'SiteEditor' });
  const tw = await getTranslations({ locale, namespace: 'BasicWebsite' });
  const tk = (key: string) => tw(key as never);
  const [view, site, news] = await Promise.all([
    getSiteEditor(id),
    getMySite(id),
    // Optional: a failure here must not take the website editor with it.
    listSiteNews('portal', id, { pageSize: NEWS_PAGE_SIZE }).catch(() => null),
  ]).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });
  const presetNames = Object.fromEntries(
    view.presets.map((item) => [
      item.key,
      `${tk(`demos.${item.key}.name`)} — ${tk(`demos.${item.key}.kind`)}`,
    ]),
  );

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        back={{ href: `/portal/projects/${id}/site`, label: t('back') }}
      />
      <SiteEditorShell
        locale={locale}
        projectId={id}
        initial={view}
        presetNames={presetNames}
        liveUrl={site.url}
        newBookingPageUrl={webappUrl('citas', locale, '/editar/nueva')}
        news={news}
      />
    </div>
  );
}
