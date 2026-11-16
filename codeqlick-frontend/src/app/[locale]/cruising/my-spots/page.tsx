import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import styles from '@/components/cruising/Cruising.module.css';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { getCruisingStatus, listMyCruisingSpots } from '@/lib/api/cruising';
import { requireUser } from '@/lib/auth/session';
import { countryName, spotHref, type CruisingSpotStatus } from '@/lib/cruising';
import { firstParam, formatDate } from '@/lib/format';
import vc from '../../videochat/videochat.module.css';
import { deleteSpotAction, emailAlertsAction } from '../actions';
import { CruisingGate } from '../Gate';

/** Behind the account: kept out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string | string[]; saved?: string | string[] }>;
};

const TONES: Record<CruisingSpotStatus, BadgeTone> = {
  PENDING: 'warning',
  LIVE: 'success',
  REJECTED: 'danger',
  HIDDEN: 'neutral',
  REMOVED: 'danger',
};

/** The spots I proposed: where each stands, why one was rejected, and what I can still change. */
export default async function CruisingMySpotsPage({ params, searchParams }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const query = await searchParams;
  await requireUser(locale, `/${locale}/cruising/my-spots`);
  const status = await getCruisingStatus();
  const gate = await CruisingGate({ locale, status });
  if (gate) return gate;
  const t = await getTranslations({ locale, namespace: 'Cruising.mySpots' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  const spots = await listMyCruisingSpots();

  return (
    <>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{t('lead')}</p>
      {firstParam(query.sent) ? <Alert tone="success">{t('sent')}</Alert> : null}
      {firstParam(query.saved) ? <Alert tone="success">{t('saved')}</Alert> : null}
      <p>
        <Button href="/cruising/new">{t('propose')}</Button>
      </p>
      {spots.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className={styles.spotList}>
          {spots.map((spot) => {
            const editable = spot.status === 'PENDING' || spot.status === 'REJECTED';
            return (
              <li key={spot.id} className={styles.spotCard}>
                <h2 className={styles.subTitle}>
                  {spot.status === 'LIVE' ? (
                    <Link href={spotHref(spot.slug)} className={vc.inlineLink}>
                      {spot.name}
                    </Link>
                  ) : (
                    spot.name
                  )}{' '}
                  <Badge tone={TONES[spot.status]}>{t(`status.${spot.status}`)}</Badge>
                </h2>
                <p className={styles.spotMeta}>
                  <span className={styles.typeTag}>{tt(spot.type)}</span>
                  <span>
                    {spot.city}, {countryName(spot.countryCode, locale)}
                  </span>
                  <span>{t('proposedOn', { date: formatDate(spot.createdAt, locale) })}</span>
                </p>
                <p className={vc.muted}>{t(`explain.${spot.status}`)}</p>
                {spot.status === 'REJECTED' || spot.status === 'REMOVED' ? (
                  <p className={vc.answer}>
                    <strong>{t('rejectReason')}:</strong> {spot.rejectReason ?? t('noReason')}
                  </p>
                ) : null}
                {editable ? (
                  <div className={styles.rowActions}>
                    <Button href={`/cruising/my-spots/${spot.id}`} variant="outline" size="sm">
                      {spot.status === 'REJECTED' ? t('editAndResend') : t('edit')}
                    </Button>
                    <ActionForm action={deleteSpotAction.bind(null, locale, spot.id)}>
                      <SubmitButton variant="outline" size="sm" pendingLabel={t('deleting')}>
                        {t('delete')}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <section className={vc.panel} aria-labelledby="cruising-alerts">
        <h2 id="cruising-alerts" className={vc.sectionTitle}>
          {t('alertsTitle')}
        </h2>
        <ActionForm action={emailAlertsAction.bind(null, locale)}>
          <FormCheckbox
            name="emailAlerts"
            label={t('alertsLabel')}
            hint={t('alertsHint')}
            defaultChecked={status.emailAlerts}
          />
          <SubmitButton variant="outline" size="sm" pendingLabel={t('alertsSaving')}>
            {t('alertsSave')}
          </SubmitButton>
        </ActionForm>
      </section>
    </>
  );
}
