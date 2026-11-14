import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudMe, type CloudMe } from '@/lib/api/cloud';
import { createTeamAction } from '../actions';
import { CloudDocsLink } from '../CloudDocsLink';
import styles from '../cloud.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.console' });
  return { title: t('title') };
}

/** The console's start: my teams, and creating one with the Cloud terms. */
export default async function CloudConsolePage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const me: CloudMe | null = await getCloudMe().catch(() => null);

  return (
    <div className={styles.landing}>
      <div>
        <h1 className={styles.heroTitle}>{t('console.title')}</h1>
        <p className={styles.muted}>{t('console.lead')}</p>
        <p className={styles.spacedSmall}>
          <Link href="/cloud/console/tokens">{t('console.tokensLink')}</Link>
          {' · '}
          <CloudDocsLink locale={locale}>{t('nav.docs')}</CloudDocsLink>
        </p>
      </div>

      <section aria-labelledby="teams-title">
        <h2 id="teams-title" className={styles.sectionTitle}>
          {t('console.teams')}
        </h2>
        {me === null ? (
          <p className={styles.muted}>{t('common.loadError')}</p>
        ) : me.teams.length === 0 ? (
          <p className={styles.muted}>{t('console.empty')}</p>
        ) : (
          <ul className={styles.grid}>
            {me.teams.map((team) => (
              <li key={team.id} className={styles.tile}>
                <Link href={`/cloud/console/${team.slug}`} className={styles.tileLink}>
                  {team.name}
                </Link>
                <p className={styles.small}>
                  <span className={styles.mono}>{team.slug}</span>
                </p>
                <p>
                  <Badge tone={team.role === 'OWNER' ? 'brand' : 'neutral'}>
                    {t(`common.roles.${team.role}`)}
                  </Badge>
                </p>
                {team.twoFactorBlocked ? (
                  <p>
                    <Badge tone="warning">{t('twoFactor.badge')}</Badge>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {me ? (
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="create-title">
          <h2 id="create-title" className={styles.cardTitle}>
            {t('console.createTitle')}
          </h2>
          <ActionForm
            action={createTeamAction.bind(null, locale, me.termsVersion)}
            className={styles.form}
          >
            <FormInput name="name" label={t('console.name')} required maxLength={60} />
            <FormInput
              name="slug"
              label={t('console.slug')}
              hint={t('console.slugHint')}
              required
              maxLength={30}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              autoCapitalize="none"
              spellCheck={false}
              mono
            />
            <FormCheckbox name="terms" label={t('console.terms')} required />
            <p className={styles.small}>
              <Link href="/cloud/terms-of-use">{t('console.termsLink')}</Link>
            </p>
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('console.creating')}>
                {t('console.create')}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
