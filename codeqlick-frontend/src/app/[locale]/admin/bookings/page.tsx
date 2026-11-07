import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminGetBookingSettings, adminListBookings } from '@/lib/api/bookings';
import { BOOKING_TIME_ZONE, intervalsToText, WEEKDAYS } from '@/lib/booking';
import { firstParam } from '@/lib/format';
import { cancelBookingAction, saveBookingSettingsAction } from './actions';

const DURATIONS = [15, 20, 30, 45, 60];

export default async function AdminBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.bookings' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const td = await getTranslations({ locale, namespace: 'Weekdays' });
  const scope = firstParam((await searchParams).scope) === 'past' ? 'past' : 'upcoming';
  const [bookings, config] = await Promise.all([
    adminListBookings(scope),
    adminGetBookingSettings(),
  ]);
  const when = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    timeZone: BOOKING_TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        actions={
          <>
            <Link
              href={scope === 'past' ? '/admin/bookings' : '/admin/bookings?scope=past'}
              className={buttonClassName({ variant: 'outline', size: 'sm' })}
            >
              {scope === 'past' ? t('showUpcoming') : t('showPast')}
            </Link>
            {config.enabled ? (
              <Button href="/book" variant="outline" size="sm">
                {t('view')}
              </Button>
            ) : null}
          </>
        }
      />

      <section className={styles.panel} aria-labelledby="calls-heading">
        <h2 id="calls-heading" className={styles.panelTitle}>
          {scope === 'past' ? t('pastTitle') : t('upcomingTitle')}
        </h2>
        {bookings.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            body={config.enabled ? t('emptyBody') : t('emptyDisabled')}
          />
        ) : (
          <ul className={styles.files}>
            {bookings.map((booking) => (
              <li key={booking.id} className={styles.fileRow}>
                <div className={styles.fileInfo}>
                  <span className={styles.fileName}>{when.format(new Date(booking.startsAt))}</span>
                  <span>
                    {booking.leadId ? (
                      <Link href={`/admin/leads/${booking.leadId}`}>{booking.name}</Link>
                    ) : (
                      booking.name
                    )}
                    {booking.company ? ` · ${booking.company}` : ''} ·{' '}
                    <a href={`mailto:${booking.email}`}>{booking.email}</a>
                  </span>
                  {booking.message ? <span className={styles.muted}>{booking.message}</span> : null}
                </div>
                {booking.status === 'CANCELLED' ? (
                  <Badge tone="neutral">{t('cancelled')}</Badge>
                ) : scope === 'upcoming' ? (
                  <ActionForm action={cancelBookingAction.bind(null, locale, booking.id)}>
                    <SubmitButton variant="ghost" size="sm" pendingLabel={t('cancelling')}>
                      {t('cancel')}
                      <span className="visually-hidden"> — {booking.name}</span>
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel} id="settings" aria-labelledby="settings-heading">
        <h2 id="settings-heading" className={styles.panelTitle}>
          {t('settingsTitle')}
        </h2>
        <ActionForm action={saveBookingSettingsAction.bind(null, locale)} className={styles.form}>
          <FormInput
            name="meetingUrl"
            type="url"
            label={t('meetingUrl')}
            hint={t('meetingUrlHint')}
            placeholder="https://meet.google.com/abc-defg-hij"
            defaultValue={config.meetingUrl}
          />
          <FormInput
            name="calendarEmail"
            type="email"
            label={t('calendarEmail')}
            optionalLabel={tc('optional')}
            hint={t('calendarEmailHint')}
            placeholder="tu.cuenta@gmail.com"
            defaultValue={config.calendarEmail ?? ''}
          />
          <div className={styles.row}>
            <FormSelect
              name="durationMinutes"
              label={t('duration')}
              options={DURATIONS.map((value) => ({
                value: String(value),
                label: t('minutes', { value }),
              }))}
              defaultValue={String(config.durationMinutes)}
            />
            <FormInput
              name="minNoticeHours"
              type="number"
              min={0}
              label={t('notice')}
              hint={t('noticeHint')}
              defaultValue={String(config.minNoticeHours)}
            />
            <FormInput
              name="horizonDays"
              type="number"
              min={1}
              max={90}
              label={t('horizon')}
              hint={t('horizonHint')}
              defaultValue={String(config.horizonDays)}
            />
          </div>
          <fieldset className={styles.form}>
            <legend className={styles.panelTitle}>{t('hoursTitle')}</legend>
            <p className={styles.muted}>{t('hoursLead')}</p>
            {WEEKDAYS.map((day) => (
              <FormInput
                key={day}
                name={`day.${day}`}
                label={td(day)}
                placeholder="09:00-13:00, 16:00-18:00"
                defaultValue={intervalsToText(config.weekly[day])}
              />
            ))}
          </fieldset>
          <FormCheckbox
            name="enabled"
            label={t('enabled')}
            hint={t('enabledHint')}
            defaultChecked={config.enabled}
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
