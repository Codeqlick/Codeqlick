import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app/PageHeader';
import styles from '@/components/app/app.module.css';
import { Avatar } from '@/components/ui/Avatar';
import { Card, CardLink } from '@/components/ui/Card';
import { resolveCruisingLocale } from '@/i18n/locale';
import { accountPath } from '@/lib/account-links';
import { accountApps, getTwoFactorStatus, listPasskeys, listSessions } from '@/lib/api/auth';
import { requireUser } from '@/lib/auth/session';

/** The account site's overview: who is signed in and each section with its state. */
export default async function AccountOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveCruisingLocale((await params).locale);
  const user = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const ta = await getTranslations({ locale, namespace: 'Account' });
  const [twoFactor, passkeys, sessions, apps] = await Promise.all([
    getTwoFactorStatus(),
    listPasskeys().catch(() => ({ items: [] })),
    listSessions(),
    accountApps().catch(() => ({ items: [] })),
  ]);

  const cards = [
    { href: '/profile', title: t('nav.profile'), body: t('overview.profile') },
    {
      href: '/security',
      title: t('nav.security'),
      body: t('overview.security', {
        twoFactor: twoFactor.enabled ? 'on' : 'off',
        passkeys: passkeys.items.length,
        sessions: sessions.length,
      }),
    },
    { href: '/privacy', title: t('nav.privacy'), body: t('overview.privacy') },
    { href: '/notifications', title: t('nav.notifications'), body: t('overview.notifications') },
    { href: '/apps', title: t('nav.apps'), body: t('overview.apps', { count: apps.items.length }) },
  ];

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('overview.title', { name: user.name })}
        lead={
          user.username
            ? `@${user.username} · ${ta('signedInAs', { email: user.email })}`
            : ta('signedInAs', { email: user.email })
        }
        actions={<Avatar file={user.avatar} name={user.name} size="header" />}
      />
      <p className={styles.muted}>{t('overview.lead')}</p>
      <ul className={styles.cards}>
        {cards.map((card) => (
          <li key={card.href}>
            <Card interactive>
              <h2 className={styles.cardTitle}>
                <CardLink href={accountPath(card.href)}>{card.title}</CardLink>
              </h2>
              <p className={styles.muted}>{card.body}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
