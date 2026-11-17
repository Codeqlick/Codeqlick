import { getTranslations } from 'next-intl/server';
import { verificationAction } from '@/app/[locale]/admin/adult/actions';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import appStyles from '@/components/app/app.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { ADULT_APP_NAMES } from '@/lib/adult';
import { listAdultVerifications } from '@/lib/api/adult';
import { formatDateTime } from '@/lib/format';
import styles from './AdultAdmin.module.css';

/**
 * The one verification queue of the three 18+ apps (architecture 4.16): the same rows show in the
 * verification tab of each admin, and deciding in one decides for all.
 */
export async function AdultVerificationQueue({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'AdminAdult.queue' });
  const items = await listAdultVerifications();

  return (
    <section className={appStyles.panel}>
      <h2 className={appStyles.panelTitle}>{t('title')}</h2>
      <p className={appStyles.muted}>{t('lead')}</p>
      {items.length === 0 ? <p className={appStyles.muted}>{t('empty')}</p> : null}
      {items.map((item) => {
        const names = [item.names.cruising, item.names.username].filter(
          (name): name is string => !!name,
        );
        return (
          <article key={item.userId} className={styles.item}>
            {/* oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route */}
            <img
              src={`/${locale}/admin/adult/verification/${item.userId}`}
              alt={t('alt')}
              className={styles.image}
            />
            <div className={styles.body}>
              <p>
                <Link href={`/admin/adult/users/${item.userId}`}>
                  <strong>{item.name}</strong>
                </Link>{' '}
                · {item.email}
              </p>
              <p className={appStyles.muted}>
                {item.sourceApp ? t('sentFrom', { app: ADULT_APP_NAMES[item.sourceApp] }) : ''}
                {item.sentAt ? ` ${formatDateTime(item.sentAt, locale)}` : ''}
              </p>
              <p className={appStyles.muted}>
                {t('check', { name: item.verifiedName ?? names[0] ?? '—' })}
              </p>
              {names.length > 0 ? (
                <p className={appStyles.muted}>{t('names', { names: names.join(' · ') })}</p>
              ) : null}
              <ActionForm
                action={verificationAction.bind(null, locale, item.userId)}
                className={appStyles.form}
              >
                <FormInput
                  id={`adult-verification-note-${item.userId}`}
                  name="note"
                  label={t('note')}
                  maxLength={300}
                />
                <div className={appStyles.actions}>
                  <SubmitButton size="sm" name="decision" value="approve">
                    {t('approve')}
                  </SubmitButton>
                  <SubmitButton size="sm" variant="outline" name="decision" value="reject">
                    {t('reject')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </div>
          </article>
        );
      })}
    </section>
  );
}
