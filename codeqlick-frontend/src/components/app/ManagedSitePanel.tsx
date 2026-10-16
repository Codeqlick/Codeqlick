import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { SITE_PRESETS, type ManagedSite, type ManagedSiteRevision } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import {
  buildSiteAction,
  createSiteAction,
  restoreSiteRevisionAction,
  saveSiteContentAction,
  updateSiteDomainAction,
} from '@/app/[locale]/admin/projects/site-actions';
import styles from './app.module.css';

const TONES = { NONE: 'neutral', BUILDING: 'warning', LIVE: 'success', FAILED: 'danger' } as const;

/** Admin → project: the project's managed website (create it, its status, domain, content). */
export async function ManagedSitePanel({
  locale,
  projectId,
  projectName,
  site,
  revisions,
}: {
  locale: AppLocale;
  projectId: string;
  projectName: string;
  site: ManagedSite | null;
  revisions: ManagedSiteRevision[];
}) {
  const t = await getTranslations({ locale, namespace: 'ManagedSite' });
  const tk = (key: string) => t(key as never);

  if (!site) {
    const suggested = projectName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return (
      <div className={styles.stack}>
        <p className={styles.muted}>{t('none')}</p>
        <ActionForm action={createSiteAction.bind(null, locale, projectId)} className={styles.form}>
          <div className={styles.row}>
            <FormInput
              id="site-slug"
              name="slug"
              label={t('slug')}
              hint={t('slugHint')}
              defaultValue={suggested}
              required
              maxLength={40}
            />
            <FormSelect
              name="preset"
              label={t('preset')}
              options={SITE_PRESETS.map((value) => ({ value, label: tk(`presets.${value}`) }))}
              defaultValue="peluqueria"
              required
            />
          </div>
          <FormInput id="site-domain" name="domain" label={t('domain')} hint={t('domainHint')} />
          <div className={styles.actions}>
            <SubmitButton size="sm" pendingLabel={t('creating')}>
              {t('create')}
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <p>
        <Badge tone={TONES[site.status]}>{tk(`statuses.${site.status}`)}</Badge>{' '}
        {site.lastBuildAt
          ? t('lastBuild', { date: formatDateTime(site.lastBuildAt, locale) })
          : null}
      </p>
      <ul className={styles.simpleList}>
        <li>
          <span>{t('preview')}</span>
          <a href={site.previewUrl} target="_blank" rel="noopener noreferrer">
            {site.previewUrl}
          </a>
        </li>
        {site.domain ? (
          <li>
            <span>{t('live')}</span>
            <a href={site.url} target="_blank" rel="noopener noreferrer">
              {site.url}
            </a>
          </li>
        ) : null}
      </ul>
      {site.status === 'FAILED' && site.lastBuildError ? (
        <>
          <p className={styles.muted}>{t('buildError')}</p>
          <pre className={styles.code}>{site.lastBuildError}</pre>
        </>
      ) : null}
      <ActionForm action={buildSiteAction.bind(null, locale, projectId)}>
        <SubmitButton variant="outline" size="sm" pendingLabel={t('building')}>
          {t('build')}
        </SubmitButton>
      </ActionForm>

      <ActionForm
        key={`domain-${site.domain ?? ''}`}
        action={updateSiteDomainAction.bind(null, locale, projectId)}
        className={styles.form}
      >
        <FormInput
          id="site-domain"
          name="domain"
          label={t('domain')}
          hint={t('domainHint')}
          defaultValue={site.domain ?? ''}
        />
        <div className={styles.actions}>
          <SubmitButton variant="outline" size="sm" pendingLabel={t('savingDomain')}>
            {t('saveDomain')}
          </SubmitButton>
        </div>
      </ActionForm>

      <ActionForm
        key={`content-${site.updatedAt}`}
        action={saveSiteContentAction.bind(null, locale, projectId)}
        className={styles.form}
      >
        <FormTextarea
          id="site-content"
          name="content"
          label={t('content')}
          hint={t('contentHint')}
          rows={24}
          spellCheck={false}
          className={styles.codeInput}
          defaultValue={JSON.stringify(site.content, null, 2)}
          required
        />
        <div className={styles.actions}>
          <SubmitButton size="sm" pendingLabel={t('savingContent')}>
            {t('saveContent')}
          </SubmitButton>
        </div>
      </ActionForm>

      <h3 className={styles.panelTitle}>{t('revisions')}</h3>
      {revisions.length === 0 ? (
        <p className={styles.muted}>{t('noRevisions')}</p>
      ) : (
        <ul className={styles.simpleList}>
          {revisions.map((revision) => (
            <li key={revision.id}>
              <span>
                {t('revisionBy', {
                  date: formatDateTime(revision.createdAt, locale),
                  author: revision.author?.name ?? '—',
                })}
              </span>
              <ActionForm
                action={restoreSiteRevisionAction.bind(null, locale, projectId, revision.id)}
              >
                <SubmitButton variant="ghost" size="sm" pendingLabel={t('restoring')}>
                  {t('restore')}
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
