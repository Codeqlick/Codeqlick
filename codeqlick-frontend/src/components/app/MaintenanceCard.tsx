import { getTranslations } from 'next-intl/server';
import { MAINTENANCE_TERMS_ANCHOR } from '@/content/legal/anchors';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatDate, formatMoney } from '@/lib/format';
import {
  MAINTENANCE_FEATURES,
  MAINTENANCE_TONES,
  changesLeft,
  invoiceStatus,
  maintenanceAction,
  maintenanceState,
  withVat,
  type MaintenanceView,
} from '@/lib/maintenance';
import styles from './app.module.css';
import card from './MaintenanceCard.module.css';

/**
 * The maintenance plan on a project's "Tu web" page (architecture 8.2, decision 110): what it
 * includes, the price, the state, the button to Stripe, this month's changes and the invoices.
 */
export async function MaintenanceCard({
  locale,
  projectId,
  plan,
  action,
  notice,
}: {
  locale: AppLocale;
  projectId: string;
  plan: MaintenanceView;
  /** Sends the client to Stripe (Checkout or the customer portal). */
  action: (formData: FormData) => Promise<void>;
  /** Back from Stripe: `done`, `canceled` or `error`. */
  notice?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Maintenance' });
  const state = maintenanceState(plan);
  const button = maintenanceAction(plan);
  const price = plan.price;
  const periodEnd = plan.periodEnd ? formatDate(plan.periodEnd, locale) : null;
  const left = changesLeft(plan.allowance);

  return (
    <section className={styles.panel} id="maintenance" aria-labelledby="maintenance-heading">
      <div className={card.head}>
        <h2 id="maintenance-heading" className={styles.panelTitle}>
          {t('title')}
        </h2>
        <Badge tone={MAINTENANCE_TONES[state]}>{t(`statusLabels.${state}`)}</Badge>
      </div>
      {notice === 'done' || notice === 'canceled' || notice === 'error' ? (
        <Alert tone={notice === 'done' ? 'success' : 'warning'}>{t(notice)}</Alert>
      ) : null}
      <p className={styles.muted}>{t('lead')}</p>
      <p>
        {state === 'active' && !periodEnd
          ? t('states.activeNoDate')
          : t(`states.${state}`, { date: periodEnd ?? '' })}
      </p>
      {price && !plan.included ? (
        <p className={card.price}>
          {t('price', {
            price: formatMoney(price.amountCents, price.currency.toUpperCase(), locale),
            total: formatMoney(
              withVat(price.amountCents, price.vatPercent),
              price.currency.toUpperCase(),
              locale,
            ),
          })}
        </p>
      ) : null}

      <h3 className={card.subTitle}>{t('featuresTitle')}</h3>
      <ul className={card.features}>
        {MAINTENANCE_FEATURES.map((key) => (
          <li key={key}>{t(`features.${key}`, { count: plan.allowance.limit })}</li>
        ))}
      </ul>

      {button ? (
        <form action={action} className={card.buy}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="kind" value={button} />
          <SubmitButton
            variant={button === 'portal' ? 'outline' : 'primary'}
            pendingLabel={t('opening')}
          >
            {button === 'portal' ? t('manage') : t('subscribe')}
          </SubmitButton>
          {button === 'checkout' ? (
            <p className={card.small}>
              {t.rich('terms', {
                link: (chunks) => (
                  <Link
                    href={`/terms#${MAINTENANCE_TERMS_ANCHOR[locale === 'es' ? 'es' : 'en']}`}
                    target="_blank"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : null}
        </form>
      ) : null}
      {!plan.on ? <p className={card.small}>{t('withoutPlan')}</p> : null}

      {plan.on ? (
        <div className={card.allowance}>
          <h3 className={card.subTitle}>{t('allowanceTitle')}</h3>
          <p>
            <strong>
              {t('allowance', { used: plan.allowance.used, limit: plan.allowance.limit })}
            </strong>
          </p>
          {/* Decorative: the line above says the same in words. */}
          <div className={card.track} aria-hidden="true">
            <div
              className={card.fill}
              style={{
                width: `${Math.min(100, (plan.allowance.used / plan.allowance.limit) * 100)}%`,
              }}
            />
          </div>
          {left === 0 ? <p className={card.small}>{t('allowanceOver')}</p> : null}
          <div className={styles.actions}>
            <Button
              href={`/portal/support/new?project=${projectId}&type=CHANGE`}
              variant="outline"
              size="sm"
            >
              {t('requestChange')}
            </Button>
          </div>
        </div>
      ) : null}

      {plan.invoices.length > 0 ? (
        <>
          <h3 className={card.subTitle}>{t('invoicesTitle')}</h3>
          <ul className={card.invoices}>
            {plan.invoices.map((invoice) => {
              const status = invoiceStatus(invoice.status);
              return (
                <li key={invoice.id}>
                  <span>{formatDate(invoice.createdAt, locale)}</span>
                  <span>
                    {formatMoney(invoice.totalCents, invoice.currency.toUpperCase(), locale)}
                  </span>
                  <span>{status ? t(`invoiceStatuses.${status}`) : '—'}</span>
                  {invoice.url ? (
                    <a href={invoice.url} target="_blank" rel="noopener noreferrer">
                      {invoice.number
                        ? t('invoiceOpen', { number: invoice.number })
                        : t('invoiceNoNumber')}
                    </a>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
