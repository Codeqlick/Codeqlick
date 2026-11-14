import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudMe } from '@/lib/api/cloud';
import { removeMemberAction } from '../../actions';
import styles from '../../cloud.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string; team: string }> };

/**
 * Every page of a team. While the team requires two-step verification and the account has none
 * (architecture 4.13), the API refuses the team's routes: this shows why, the way to set it up
 * and leaving the team, instead of the page. Anything else (unknown team, API down) is left to
 * the page itself.
 */
export default async function CloudTeamLayout({ children, params }: LayoutProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const me = await getCloudMe().catch(() => null);
  const team = me?.teams.find((item) => item.slug === slug);
  if (!me || !team?.twoFactorBlocked) return children;

  const t = await getTranslations({ locale, namespace: 'Cloud' });

  return (
    <div className={`${styles.landing} ${styles.narrow}`}>
      <div>
        <p className={styles.small}>
          <Link href="/cloud/console">← {t('console.title')}</Link>
        </p>
        <h1 className={styles.heroTitle}>{team.name}</h1>
      </div>
      <section className={styles.card} aria-labelledby="two-factor-title">
        <h2 id="two-factor-title" className={styles.cardTitle}>
          {t('twoFactor.blockedTitle')}
        </h2>
        <Alert tone="info">{t('twoFactor.blockedBody')}</Alert>
        <div className={styles.actions}>
          <Link href="/portal/account">{t('twoFactor.accountLink')}</Link>
          <form action={removeMemberAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="team" value={team.slug} />
            <input type="hidden" name="userId" value={me.user.id} />
            <input type="hidden" name="self" value="on" />
            <SubmitButton size="sm" variant="ghost">
              {t('members.leave')}
            </SubmitButton>
          </form>
        </div>
      </section>
    </div>
  );
}
