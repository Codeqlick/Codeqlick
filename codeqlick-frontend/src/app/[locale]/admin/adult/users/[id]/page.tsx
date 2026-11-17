import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import appStyles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { AdultOverviewPanel } from '@/components/adult/AdultOverviewPanel';
import adultStyles from '@/components/adult/AdultAdmin.module.css';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import {
  ADULT_APP_NAMES,
  ADULT_APPS,
  categoryOptions,
  SHARED_SUSPENSION_DURATIONS,
  type AdultCategory,
} from '@/lib/adult';
import { getAdultUserOverview } from '@/lib/api/adult';
import {
  deleteBannedEmailAction,
  liftAction,
  suspendAction,
  withdrawVerificationAction,
} from '../../actions';

type PageProps = { params: Promise<{ locale: string; id: string }> };

/** Behind the admin: nothing here for search engines. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One person across the three 18+ apps (architecture 4.16, phase 1): their history, the shared
 * suspension and verification controls, and the banned-email appeal form.
 */
export default async function AdminAdultUserPage({ params }: PageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'AdminAdult' });
  const tc = await getTranslations({ locale, namespace: 'AdminAdult.categories' });
  const back = { href: '/admin/videochat', label: t('back') };

  const data = await getAdultUserOverview(id);

  const bannedEmail = (
    <section className={appStyles.panel} aria-labelledby="adult-banned-email">
      <h2 id="adult-banned-email" className={appStyles.panelTitle}>
        {t('bannedEmail.title')}
      </h2>
      <p className={appStyles.muted}>{t('bannedEmail.lead')}</p>
      <ActionForm action={deleteBannedEmailAction.bind(null, locale)} className={appStyles.form}>
        <FormInput
          id="adult-banned-email-input"
          name="email"
          type="email"
          label={t('bannedEmail.email')}
          autoComplete="off"
          required
        />
        <div className={appStyles.actions}>
          <SubmitButton size="sm" variant="outline">
            {t('bannedEmail.submit')}
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );

  if (!data) {
    return (
      <div className={appStyles.stack}>
        <PageHeader title={t('title')} back={back} />
        <Alert tone="error">{t('notFound')}</Alert>
        {bannedEmail}
      </div>
    );
  }

  const suffix = t('appliesInAll');
  const seriousOptions = categoryOptions((c: AdultCategory) => tc(c), suffix, 'serious');
  const durations = SHARED_SUSPENSION_DURATIONS.map((value) => ({
    value,
    label: t(`durations.${value}`),
  }));
  const apps = ADULT_APPS.map((value) => ({ value, label: ADULT_APP_NAMES[value] }));
  const activeShared = data.sharedSuspensions.some((item) => item.active);
  const verification = data.verification;
  const canWithdraw =
    !!verification && (verification.status === 'APPROVED' || verification.status === 'PENDING');

  return (
    <div className={appStyles.stack}>
      <PageHeader title={data.name} lead={`${data.email} · ${t('lead')}`} back={back} />

      <AdultOverviewPanel locale={locale} data={data} />

      <section className={appStyles.panel} aria-labelledby="adult-actions">
        <h2 id="adult-actions" className={appStyles.panelTitle}>
          {t('actions.title')}
        </h2>

        <ActionForm action={suspendAction.bind(null, locale, id)} className={appStyles.form}>
          <h3 className={appStyles.updateTitle}>{t('suspend.title')}</h3>
          <p className={appStyles.muted}>{t('suspend.lead')}</p>
          <div className={appStyles.row}>
            <FormSelect
              name="category"
              label={t('suspend.category')}
              options={seriousOptions}
              defaultValue="MINOR"
              required
            />
            <FormSelect
              name="sourceApp"
              label={t('suspend.sourceApp')}
              options={apps}
              defaultValue="VIDEOCHAT"
              required
            />
            <FormSelect
              name="duration"
              label={t('suspend.duration')}
              options={durations}
              defaultValue="24h"
              required
            />
          </div>
          <FormInput name="reason" label={t('suspend.reason')} maxLength={500} required />
          <div className={appStyles.actions}>
            <SubmitButton size="sm" variant="danger">
              {t('suspend.submit')}
            </SubmitButton>
          </div>
        </ActionForm>

        {activeShared ? (
          <>
            <hr className={appStyles.divider} />
            <ActionForm action={liftAction.bind(null, locale, id)} className={appStyles.form}>
              <h3 className={appStyles.updateTitle}>{t('lift.title')}</h3>
              <p className={appStyles.muted}>{t('lift.lead')}</p>
              <FormInput
                id="adult-lift-reason"
                name="reason"
                label={t('lift.reason')}
                maxLength={500}
                required
              />
              <div className={appStyles.actions}>
                <SubmitButton size="sm" variant="outline">
                  {t('lift.submit')}
                </SubmitButton>
              </div>
            </ActionForm>
          </>
        ) : null}

        {canWithdraw ? (
          <>
            <hr className={appStyles.divider} />
            <h3 className={appStyles.updateTitle}>{t('withdraw.title')}</h3>
            <p className={appStyles.muted}>{t('withdraw.lead')}</p>
            {verification?.hasPhoto ? (
              // oxlint-disable-next-line nextjs/no-img-element -- private image through the BFF route
              <img
                src={`/${locale}/admin/adult/verification/${id}`}
                alt={t('queue.alt')}
                className={adultStyles.image}
              />
            ) : null}
            <ActionForm
              action={withdrawVerificationAction.bind(null, locale, id)}
              className={appStyles.form}
            >
              <FormInput
                id="adult-withdraw-reason"
                name="reason"
                label={t('withdraw.reason')}
                maxLength={500}
              />
              <div className={appStyles.actions}>
                <SubmitButton size="sm" variant="outline">
                  {t('withdraw.submit')}
                </SubmitButton>
              </div>
            </ActionForm>
          </>
        ) : null}
      </section>

      {bannedEmail}
    </div>
  );
}
