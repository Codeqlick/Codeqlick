import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudTeam, listCloudAudits } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import { runAuditAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type PageProps = { params: Promise<{ locale: string; team: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.audits' });
  return { title: t('title') };
}

/** Run the website check for a team, and its recent ones (architecture 4.13). */
export default async function CloudAuditsPage({ params }: PageProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  let data;
  try {
    data = await Promise.all([getCloudTeam(slug), listCloudAudits(slug)]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const [team, audits] = data;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}`}>← {team.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>{t('audits.title')}</h1>
        <p className={styles.muted}>{t('audits.lead')}</p>
      </div>
      <section className={`${styles.card} ${styles.narrow}`}>
        <ActionForm action={runAuditAction.bind(null, locale, team.slug)} className={styles.form}>
          <FormInput
            name="url"
            type="url"
            label={t('audits.url')}
            placeholder="https://"
            required
            mono
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('audits.running')}>{t('audits.run')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
      <div className={styles.card}>
        <p className={styles.muted}>{t('audits.ci')}</p>
        <pre className={styles.terminal}>
          {`npx @codeqlick/cli audit https://… --team ${team.slug} --min-score 80`}
        </pre>
      </div>
      <section aria-labelledby="recent">
        <h2 id="recent" className={styles.sectionTitle}>
          {t('audits.recent')}
        </h2>
        {audits.items.length === 0 ? (
          <p className={styles.muted}>{t('audits.empty')}</p>
        ) : (
          <ul className={styles.list}>
            {audits.items.map((audit) => (
              <li key={audit.id} className={`${styles.row} ${styles.tileRow}`}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <Link
                      href={`/cloud/console/${team.slug}/audits/${audit.id}`}
                      className={styles.tileLink}
                    >
                      {audit.score}/100
                    </Link>
                    <span className={styles.mono}>{audit.url}</span>
                    {audit.preview ? <Badge>{t('audits.previewBadge')}</Badge> : null}
                  </p>
                  <p className={styles.small}>{formatWhen(audit.createdAt, locale)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
