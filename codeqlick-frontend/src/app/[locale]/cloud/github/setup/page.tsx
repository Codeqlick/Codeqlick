import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { linkCloudGithub } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { appPath } from '@/lib/webapp-request';
import styles from '../../cloud.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ installation_id?: string; code?: string; state?: string }>;
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * GitHub sends the person back here after installing the app (decision 40): the API checks the
 * installation with their GitHub authorization and links it, then they go back to the project.
 */
export default async function GithubSetupPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.git' });
  const query = await searchParams;
  const installationId = Number(query.installation_id);
  let error: string | null = null;
  let back: string | null = null;
  if (!Number.isInteger(installationId) || installationId <= 0 || !query.code || !query.state) {
    error = t('setupMissing');
  } else {
    try {
      const result = await linkCloudGithub({
        installationId,
        code: query.code,
        state: query.state,
      });
      back = result.team
        ? `/${locale}/cloud/console/${result.team}${result.project ? `/${result.project}?tab=git&github=connected` : ''}`
        : `/${locale}/cloud/console`;
    } catch (failure) {
      error = isApiError(failure) && failure.detail ? failure.detail : t('connectError');
    }
  }
  if (back) redirect(await appPath(back, locale));
  return (
    <div className={`${styles.landing} ${styles.narrow}`}>
      <h1 className={styles.heroTitle}>GitHub</h1>
      <Alert tone="error">{error}</Alert>
      <p>
        <Link href="/cloud/console">{t('backToConsole')}</Link>
      </p>
    </div>
  );
}
