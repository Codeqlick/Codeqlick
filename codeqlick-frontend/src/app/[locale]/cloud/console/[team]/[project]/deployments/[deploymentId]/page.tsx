import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudDeployment, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { configJson, formatBytes, formatWhen, ruleSettings } from '@/lib/cloud';
import styles from '../../../../../cloud.module.css';

type PageProps = {
  params: Promise<{ locale: string; team: string; project: string; deploymentId: string }>;
};

export const metadata: Metadata = { title: 'Deployment' };

/** One deployment: its details and the rules of its `codeqlick.json`, read-only. */
export default async function CloudDeploymentPage({ params }: PageProps) {
  const { locale: raw, team, project: slug, deploymentId } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  let project;
  let deployment;
  try {
    project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) notFound();
    deployment = await getCloudDeployment(project.id, deploymentId);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const rules = deployment.rules;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team}/${slug}`}>← {project.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>
          <span className={styles.mono}>{deployment.shortId}</span>
        </h1>
        <p className={styles.rowTitle}>
          {deployment.isProduction ? (
            <Badge tone="success">{t('project.productionTag')}</Badge>
          ) : (
            <Badge>{t('project.preview')}</Badge>
          )}
          <span className={styles.small}>
            {formatWhen(deployment.createdAt, locale)} · {formatBytes(deployment.sizeBytes, locale)}{' '}
            · {t('project.files', { count: deployment.fileCount })}
          </span>
        </p>
        {deployment.message ? <p className={styles.muted}>{deployment.message}</p> : null}
      </div>
      <section aria-labelledby="rules-title">
        <h2 id="rules-title" className={styles.sectionTitle}>
          {t('project.rules.title')}
        </h2>
        {rules === null ? (
          <p className={styles.muted}>{t('project.rules.none')}</p>
        ) : (
          <>
            <p>
              {t('project.rules.summary', {
                redirects: rules.redirects,
                rewrites: rules.rewrites,
                headers: rules.headers,
              })}
            </p>
            {ruleSettings(rules).length > 0 ? (
              <ul className={styles.small}>
                {ruleSettings(rules).map(({ key, value }) => (
                  <li key={key}>
                    <span className={styles.mono}>{key}</span>:{' '}
                    <span className={styles.mono}>{String(value)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {rules.config ? (
              <details className={styles.spacedSmall}>
                <summary>{t('project.rules.file')}</summary>
                <pre className={styles.terminal} tabIndex={0}>
                  {configJson(rules.config)}
                </pre>
              </details>
            ) : null}
            <p className={styles.small}>{t('project.rules.readOnly')}</p>
          </>
        )}
      </section>
    </div>
  );
}
