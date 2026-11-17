import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { listPasskeys } from '@/lib/api/auth';
import {
  deletePasskeyAction,
  passkeyRegistrationOptionsAction,
  registerPasskeyAction,
  renamePasskeyAction,
} from '@/lib/auth/passkey-actions';
import { formatDateTime } from '@/lib/format';
import { MAX_PASSKEYS, PASSKEY_NAME_MAX, suggestedPasskeyName } from '@/lib/passkeys';
import { ActionForm, FormInput } from './ActionForm';
import { PasskeyAdd } from './PasskeyAdd';
import styles from './app.module.css';
import own from './Passkeys.module.css';

/** "Passkeys" in My account → Security (decision 104): the list, renaming, deleting, adding. */
export async function PasskeysPanel({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Passkeys' });
  const ts = await getTranslations({ locale, namespace: 'Sessions' });
  const [{ items }, requestHeaders] = await Promise.all([listPasskeys(), headers()]);
  const suggestedName = suggestedPasskeyName(requestHeaders.get('user-agent'), (browser, os) =>
    ts('browserOnOs', { browser, os }),
  );

  return (
    <section className={styles.panel} aria-labelledby="passkeys-title">
      <h2 id="passkeys-title" className={styles.panelTitle}>
        {t('title')}
      </h2>
      <p className={styles.muted}>{t('lead')}</p>
      {items.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <ul className={styles.files}>
          {items.map((passkey) => (
            <li key={passkey.id} className={styles.fileRow}>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>
                  {passkey.name}{' '}
                  {passkey.backedUp ? <Badge tone="info">{t('synced')}</Badge> : null}
                </span>
                <span className={styles.muted}>
                  {t('meta', {
                    created: formatDateTime(passkey.createdAt, locale),
                    used: passkey.lastUsedAt ? formatDateTime(passkey.lastUsedAt, locale) : 'never',
                  })}
                </span>
              </div>
              <details className={own.manage}>
                <summary>{t('manage')}</summary>
                <div className={own.manageForms}>
                  <ActionForm
                    action={renamePasskeyAction.bind(null, locale, passkey.id)}
                    className={styles.form}
                  >
                    <FormInput
                      id={`passkey-${passkey.id}-name`}
                      name="name"
                      label={t('name')}
                      defaultValue={passkey.name}
                      maxLength={PASSKEY_NAME_MAX}
                      autoComplete="off"
                      required
                    />
                    <div className={styles.actions}>
                      <SubmitButton variant="outline" size="sm" pendingLabel={t('renaming')}>
                        {t('rename')}
                      </SubmitButton>
                    </div>
                  </ActionForm>
                  <ActionForm
                    action={deletePasskeyAction.bind(null, locale, passkey.id)}
                    className={styles.form}
                  >
                    <p className={styles.muted}>{t('deleteBody')}</p>
                    <FormInput
                      id={`passkey-${passkey.id}-password`}
                      name="password"
                      type="password"
                      label={t('password')}
                      autoComplete="current-password"
                      required
                    />
                    <div className={styles.actions}>
                      <SubmitButton variant="danger" size="sm" pendingLabel={t('deleting')}>
                        {t('delete')}
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.muted}>{t('count', { count: items.length, max: MAX_PASSKEYS })}</p>
      {items.length < MAX_PASSKEYS ? (
        <PasskeyAdd
          getOptions={passkeyRegistrationOptionsAction.bind(null, locale)}
          register={registerPasskeyAction.bind(null, locale)}
          suggestedName={suggestedName}
          labels={{
            title: t('addTitle'),
            body: t('addBody'),
            name: t('name'),
            nameHint: t('nameHint'),
            password: t('password'),
            add: t('add'),
            adding: t('adding'),
            cancelled: t('cancelled'),
            exists: t('exists'),
            unsupported: t('unsupported'),
            failed: t('failed'),
          }}
        />
      ) : (
        <p className={styles.muted}>{t('limit', { max: MAX_PASSKEYS })}</p>
      )}
    </section>
  );
}
