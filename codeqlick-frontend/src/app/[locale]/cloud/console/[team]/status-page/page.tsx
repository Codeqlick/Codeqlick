import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormTextarea } from '@/components/app/ActionForm';
import { CopyLink } from '@/components/app/CopyLink';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import {
  getCloudStatusPage,
  getCloudTeam,
  listCloudMonitors,
  listCloudStatusNotices,
} from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { env } from '@/lib/env';
import { webappUrl } from '@/lib/webapp-seo';
import { saveStatusPageAction } from '../../../actions';
import styles from '../../../cloud.module.css';
import { NoticesSection } from './NoticesSection';

type PageProps = {
  params: Promise<{ locale: string; team: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.statusPage' });
  return { title: t('title') };
}

/**
 * A team's public status page: on or off, its title and which monitors it shows, as what; and its
 * notices (incidents and scheduled maintenance).
 */
export default async function CloudStatusPageSettings({ params, searchParams }: PageProps) {
  const { locale: raw, team: slug } = await params;
  const query = await searchParams;
  const pastPage = Math.max(1, Number(query.page) || 1);
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  let data;
  try {
    data = await Promise.all([
      getCloudTeam(slug),
      getCloudStatusPage(slug),
      listCloudMonitors(slug),
      // At most 20 are open at once (architecture 4.13, Notices): one page holds them all.
      listCloudStatusNotices(slug, true, 1, 20),
      listCloudStatusNotices(slug, false, pastPage, 10),
    ]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const [team, page, { items: monitors }, open, past] = data;
  const admin = team.role !== 'MEMBER';
  const publicUrl = webappUrl('cloud', locale, `/status/${team.slug}`);
  const badge = `${env.PUBLIC_API_URL}/cloud/status/${team.slug}/badge.svg`;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}/monitors`}>← {t('monitors.title')}</Link>
        </p>
        <h1 className={styles.heroTitle}>{t('statusPage.title')}</h1>
        <p className={styles.muted}>{t('statusPage.lead')}</p>
      </div>
      <div className={styles.card}>
        <p className={styles.small}>{page.enabled ? t('statusPage.live') : t('statusPage.off')}</p>
        <CopyLink url={publicUrl} labels={{ copy: t('common.copy'), copied: t('common.copied') }} />
        {page.enabled ? (
          <p className={styles.small}>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              {t('statusPage.open')}
            </a>
          </p>
        ) : null}
        <p className={styles.small}>{t('statusPage.badge')}</p>
        <CopyLink
          url={`![status](${badge})`}
          labels={{ copy: t('common.copy'), copied: t('common.copied') }}
        />
      </div>
      {admin ? (
        <section className={`${styles.card} ${styles.narrow}`}>
          <ActionForm
            action={saveStatusPageAction.bind(
              null,
              locale,
              team.slug,
              monitors.map((m) => m.id),
            )}
            className={styles.form}
          >
            <FormCheckbox
              name="enabled"
              label={t('statusPage.enabled')}
              defaultChecked={page.enabled}
            />
            <FormInput
              name="title"
              label={t('statusPage.pageTitle')}
              defaultValue={page.title}
              required
              maxLength={80}
            />
            <FormTextarea
              name="intro"
              label={t('statusPage.intro')}
              defaultValue={page.intro ?? ''}
              rows={3}
              maxLength={500}
            />
            <fieldset className={styles.fieldset}>
              <legend>{t('statusPage.items')}</legend>
              {monitors.length === 0 ? <p className={styles.small}>{t('monitors.empty')}</p> : null}
              {monitors.map((monitor) => {
                const item = page.items.find((i) => i.monitorId === monitor.id);
                return (
                  <div key={monitor.id} className={styles.form}>
                    <FormCheckbox
                      name={`show.${monitor.id}`}
                      label={monitor.name}
                      defaultChecked={!!item}
                    />
                    <FormInput
                      name={`label.${monitor.id}`}
                      label={t('statusPage.label')}
                      defaultValue={item?.label ?? monitor.name}
                      maxLength={60}
                    />
                  </div>
                );
              })}
            </fieldset>
            <div className={styles.actions}>
              <SubmitButton>{t('statusPage.save')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
      <NoticesSection
        locale={locale}
        team={team.slug}
        admin={admin}
        monitors={monitors}
        open={open.items}
        past={past}
      />
    </div>
  );
}
