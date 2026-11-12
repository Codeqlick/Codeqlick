import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudInvite, getCloudMe, type CloudInvite } from '@/lib/api/cloud';
import { acceptInviteAction } from '../actions';
import styles from '../cloud.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.invite' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

/** The link of a team invitation: who invited, which team and role, accept with the terms. */
export default async function CloudInvitePage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const token = ((await searchParams).token ?? '').slice(0, 100);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const [invite, me] = await Promise.all([
    token ? getCloudInvite(token).catch(() => null) : Promise.resolve<CloudInvite | null>(null),
    getCloudMe().catch(() => null),
  ]);

  return (
    <div className={`${styles.landing} ${styles.narrow}`}>
      <h1 className={styles.heroTitle}>{t('invite.title')}</h1>
      {!invite || !me ? (
        <Alert tone="error">{t('invite.invalid')}</Alert>
      ) : !invite.emailMatches ? (
        <Alert tone="error">{t('invite.wrongEmail', { email: invite.email })}</Alert>
      ) : (
        <div className={styles.card}>
          <p>
            {t('invite.body', {
              invitedBy: invite.invitedBy ?? 'Codeqlick',
              team: invite.team.name,
              role: t(`common.roles.${invite.role}`),
            })}
          </p>
          <ActionForm
            action={acceptInviteAction.bind(null, locale, token, me.termsVersion)}
            className={styles.form}
          >
            <FormCheckbox name="terms" label={t('console.terms')} required />
            <p className={styles.small}>
              <Link href="/cloud/terms-of-use">{t('console.termsLink')}</Link>
            </p>
            <div className={styles.actions}>
              <SubmitButton>{t('invite.accept')}</SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
