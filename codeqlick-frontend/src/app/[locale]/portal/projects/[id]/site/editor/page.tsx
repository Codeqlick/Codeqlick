import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SiteEditor } from '@/components/editor/SiteEditor';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMySite, getSiteEditor } from '@/lib/api/portal-site';

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
  const [view, site] = await Promise.all([getSiteEditor(id), getMySite(id)]).catch(
    (error: unknown) => {
      if (isNotFound(error)) notFound();
      throw error;
    },
  );
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
      <SiteEditor
        locale={locale}
        projectId={id}
        initial={view}
        presetNames={presetNames}
        liveUrl={site.url}
      />
    </div>
  );
}
