import { getTranslations } from 'next-intl/server';
import { keepReviewAction, shareReviewAction } from '@/app/[locale]/admin/adult/actions';
import { ActionForm } from '@/components/app/ActionForm';
import appStyles from '@/components/app/app.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { ADULT_APP_NAMES, isSeriousCategory, type AdultCategory } from '@/lib/adult';
import { listReviewSuspensions } from '@/lib/api/adult';
import { formatDateTime } from '@/lib/format';
import styles from './AdultAdmin.module.css';

/**
 * "Review for all 18+ apps": per-app suspensions made before categories existed whose report was
 * MINOR, NON_CONSENSUAL or ILLEGAL. Nothing is shared automatically: the team shares or leaves
 * each. Shown only while the list isn't empty.
 */
export async function ReviewSuspensions({ locale }: { locale: AppLocale }) {
  const items = await listReviewSuspensions().catch(() => []);
  if (items.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'AdminAdult.review' });
  const tc = await getTranslations({ locale, namespace: 'AdminAdult.categories' });
  const td = await getTranslations({ locale, namespace: 'AdminAdult.durations' });

  return (
    <section className={appStyles.panel} aria-labelledby="adult-review">
      <h2 id="adult-review" className={appStyles.panelTitle}>
        {t('title')}
      </h2>
      <p className={appStyles.muted}>{t('lead')}</p>
      {items.map((item) => (
        <article key={`${item.app}-${item.userId}`} className={styles.item}>
          <div className={styles.body}>
            <p>
              <Link href={`/admin/adult/users/${item.userId}`}>
                <strong>{item.appName ?? item.name}</strong>
              </Link>{' '}
              · {item.name} · {item.email}
            </p>
            <p className={appStyles.muted}>
              {t('where', { app: ADULT_APP_NAMES[item.app] })} ·{' '}
              {isSeriousCategory(item.reportReason)
                ? t('report', { reason: tc(item.reportReason as AdultCategory) })
                : item.reportReason}{' '}
              · {formatDateTime(item.suspendedAt, locale)} ·{' '}
              {item.until ? formatDateTime(item.until, locale) : td('permanent')}
            </p>
            {item.reason ? <p className={appStyles.muted}>{item.reason}</p> : null}
            <div className={appStyles.actions}>
              <ActionForm action={shareReviewAction.bind(null, locale, item.app, item.userId)}>
                <SubmitButton size="sm" variant="danger">
                  {t('share')}
                </SubmitButton>
              </ActionForm>
              <ActionForm action={keepReviewAction.bind(null, locale, item.app, item.userId)}>
                <SubmitButton size="sm" variant="outline">
                  {t('keep')}
                </SubmitButton>
              </ActionForm>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
