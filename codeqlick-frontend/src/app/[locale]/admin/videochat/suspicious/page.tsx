import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listSuspiciousVideochatAccounts } from '@/lib/api/videochat';
import { formatDate } from '@/lib/format';
import { clearSuspicionAction } from '../actions';

type PageProps = { params: Promise<{ locale: string }> };

/** Accounts that look like bots or fake profiles, highest score first (architecture 4.7). */
export default async function AdminVideochatSuspiciousPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'AdminVideochat.suspicious' });
  const accounts = await listSuspiciousVideochatAccounts();

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <Button href="/admin/videochat" variant="outline" size="sm">
            {t('back')}
          </Button>
        }
      />

      <section className={styles.panel}>
        {accounts.length === 0 ? (
          <p className={styles.muted}>{t('empty')}</p>
        ) : (
          <ul className={styles.updates}>
            {accounts.map((account) => (
              <li key={account.userId} className={styles.update}>
                <p>
                  <Badge tone={account.score >= 6 ? 'danger' : 'warning'}>
                    {t('score', { score: account.score })}
                  </Badge>{' '}
                  <Link href={`/admin/videochat/users/${account.userId}`}>
                    <strong>{account.nickname ?? t('noNickname')}</strong>
                  </Link>{' '}
                  ({account.email}) · {t('joined', { date: formatDate(account.joinedAt, locale) })}
                </p>
                <ul className={styles.actions} aria-label={t('reasonsLabel')}>
                  {account.reasons.map((reason) => (
                    <li key={reason}>
                      <Badge>{t(`reasons.${reason}`)}</Badge>
                    </li>
                  ))}
                </ul>
                <p className={styles.muted}>
                  {t('figures', {
                    reporters: account.reporters,
                    calls: account.calls,
                    skippedFast: account.skippedFast,
                    shortCalls: account.shortCalls,
                    maxCallsInDay: account.maxCallsInDay,
                  })}
                </p>
                <div className={styles.actions}>
                  <Button
                    href={`/admin/videochat/users/${account.userId}`}
                    variant="outline"
                    size="sm"
                  >
                    {t('open')}
                  </Button>
                  <ActionForm action={clearSuspicionAction.bind(null, locale, account.userId)}>
                    <SubmitButton size="sm" variant="outline">
                      {t('clear')}
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
