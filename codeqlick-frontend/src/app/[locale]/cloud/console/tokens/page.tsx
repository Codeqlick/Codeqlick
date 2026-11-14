import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput, FormRadioGroup, FormSelect } from '@/components/app/ActionForm';
import { TokenReveal } from '@/components/cloud/TokenReveal';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudMe, listCloudTokens } from '@/lib/api/cloud';
import { formatWhen } from '@/lib/cloud';
import { createTokenAction, revokeTokenAction } from '../../actions';
import styles from '../../cloud.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.tokens' });
  return { title: t('title') };
}

/** My API tokens: create (shown once), see their use, revoke. */
export default async function CloudTokensPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const [tokens, me] = await Promise.all([
    listCloudTokens()
      .then((result) => result.items)
      .catch(() => null),
    getCloudMe().catch(() => null),
  ]);

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href="/cloud/console">← {t('console.title')}</Link>
        </p>
        <h1 className={styles.heroTitle}>{t('tokens.title')}</h1>
        <p className={styles.muted}>{t('tokens.lead')}</p>
      </div>

      <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="new-token">
        <h2 id="new-token" className={styles.cardTitle}>
          {t('tokens.create')}
        </h2>
        <ActionForm action={createTokenAction.bind(null, locale)} className={styles.form}>
          <TokenReveal />
          <FormInput
            name="name"
            label={t('tokens.name')}
            hint={t('tokens.nameHint')}
            required
            maxLength={80}
          />
          <FormSelect
            name="team"
            label={t('tokens.team')}
            defaultValue=""
            options={[
              { value: '', label: t('tokens.allTeams') },
              ...(me?.teams ?? [])
                .filter((team) => !team.twoFactorBlocked)
                .map((team) => ({ value: team.slug, label: team.name })),
            ]}
          />
          <FormSelect
            name="expiry"
            label={t('tokens.expiry')}
            defaultValue="90"
            options={[
              { value: '30', label: t('tokens.days', { count: 30 }) },
              { value: '90', label: t('tokens.days', { count: 90 }) },
              { value: '365', label: t('tokens.days', { count: 365 }) },
              { value: 'never', label: t('tokens.never') },
            ]}
          />
          <FormRadioGroup
            name="access"
            legend={t('tokens.access')}
            defaultValue="full"
            className={styles.fieldset}
            options={[
              { value: 'full', label: t('tokens.accessFull'), hint: t('tokens.accessFullHint') },
              {
                value: 'readOnly',
                label: t('tokens.accessReadOnly'),
                hint: t('tokens.accessReadOnlyHint'),
              },
            ]}
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('tokens.creating')}>{t('tokens.create')}</SubmitButton>
          </div>
        </ActionForm>
      </section>

      {tokens === null ? (
        <p className={styles.muted}>{t('common.loadError')}</p>
      ) : tokens.length === 0 ? (
        <p className={styles.muted}>{t('tokens.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {tokens.map((token) => (
            <li key={token.id} className={styles.row}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  {token.name}
                  <span className={styles.mono}>{token.prefix}…</span>
                  <Badge>{token.team ? token.team.name : t('tokens.allTeams')}</Badge>
                  {token.readOnly ? <Badge tone="brand">{t('tokens.accessReadOnly')}</Badge> : null}
                </p>
                <p className={styles.small}>
                  {token.lastUsedAt
                    ? t('tokens.lastUsed', {
                        when: formatWhen(token.lastUsedAt, locale),
                        ip: token.lastUsedIp ?? '—',
                      })
                    : t('tokens.neverUsed')}
                  {' · '}
                  {token.expiresAt
                    ? t('tokens.expiresOn', { when: formatWhen(token.expiresAt, locale) })
                    : t('tokens.noExpiry')}
                </p>
              </div>
              <form action={revokeTokenAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="id" value={token.id} />
                <SubmitButton size="sm" variant="ghost">
                  {t('tokens.revoke')}
                  <span className="visually-hidden"> — {token.name}</span>
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
