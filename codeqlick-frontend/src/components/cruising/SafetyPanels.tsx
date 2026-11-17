import { getTranslations } from 'next-intl/server';
import {
  addContactAction,
  removeContactAction,
  saveHealthAction,
} from '@/app/[locale]/cruising/safety-actions';
import adult from '@/components/adult/adult.module.css';
import { ActionForm, FormCheckbox, FormInput, FormSelect } from '@/components/app/ActionForm';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getMyHealth, listTrustedContacts } from '@/lib/api/cruising-safety';
import {
  currentMonth,
  LIMITS,
  MAX_TRUSTED_CONTACTS,
  PREP_STATUSES,
  REMINDER_MONTHS,
  type CruisingHealth,
  type TrustedContact,
} from '@/lib/cruising-safety';
import styles from './CruisingSafety.module.css';
import { TimerPanel } from './TimerPanel';

/**
 * The safety and health sections of `/me` (phase 5): trusted contacts, the "Check on me" timer
 * (decision 95) and sexual health (decision 94, off unless turned on with its own consent).
 */
export async function SafetyPanels({
  locale,
  checkInSpot,
}: {
  locale: AppLocale;
  /** My check-in's spot: the timer can share it. */
  checkInSpot: { id: string; name: string } | null;
}) {
  const tc = await getTranslations({ locale, namespace: 'CruisingSafety.contacts' });
  const tt = await getTranslations({ locale, namespace: 'CruisingSafety.timer' });
  const th = await getTranslations({ locale, namespace: 'CruisingHealth' });
  const [contacts, health] = await Promise.all([
    listTrustedContacts().catch((): TrustedContact[] | null => null),
    getMyHealth().catch((): CruisingHealth | null => null),
  ]);
  const active = contacts?.filter((contact) => contact.status !== 'REFUSED').length ?? 0;

  return (
    <>
      <section id="timer" className={adult.panel} aria-labelledby="me-timer">
        <h2 id="me-timer" className={adult.sectionTitle}>
          {tt('title')}
        </h2>
        <p className={adult.muted}>{tt('intro')}</p>
        <TimerPanel locale={locale} spot={checkInSpot} idPrefix="me-timer" />
      </section>

      <section id="safety-contacts" className={adult.panel} aria-labelledby="me-contacts">
        <h2 id="me-contacts" className={adult.sectionTitle}>
          {tc('title')}
        </h2>
        <p className={adult.muted}>{tc('lead')}</p>
        {contacts === null ? (
          <Alert tone="error">{tc('loadError')}</Alert>
        ) : (
          <>
            {contacts.length > 0 ? (
              <ul className={styles.contactList}>
                {contacts.map((contact) => (
                  <li key={contact.id} className={styles.contactItem}>
                    <span className={styles.contactName}>
                      <strong>{contact.email}</strong>
                      <span className={adult.muted}>
                        {tc('namedAs', { name: contact.displayName })}
                      </span>
                      <span>
                        <span
                          className={`${styles.status} ${styles[`status${contact.status}`] ?? ''}`}
                        >
                          {tc(`statuses.${contact.status}`)}
                        </span>
                      </span>
                    </span>
                    {contact.status === 'REFUSED' ? (
                      <span className={adult.muted}>{tc('refusedNote')}</span>
                    ) : (
                      <ActionForm action={removeContactAction.bind(null, locale, contact.id)}>
                        <SubmitButton variant="outline" size="sm" pendingLabel={tc('removing')}>
                          {tc('remove')}
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{tc('empty')}</p>
            )}
            {active < MAX_TRUSTED_CONTACTS ? (
              <ActionForm action={addContactAction.bind(null, locale)} className={adult.form}>
                <FormInput
                  id="contact-email"
                  name="email"
                  type="email"
                  label={tc('email')}
                  hint={tc('emailHint')}
                  autoComplete="off"
                  required
                />
                <FormInput
                  id="contact-name"
                  name="displayName"
                  label={tc('displayName')}
                  hint={tc('displayNameHint')}
                  maxLength={LIMITS.displayName}
                  autoComplete="off"
                  required
                />
                <SubmitButton pendingLabel={tc('adding')}>{tc('add')}</SubmitButton>
              </ActionForm>
            ) : (
              <p className={adult.muted}>{tc('max', { count: MAX_TRUSTED_CONTACTS })}</p>
            )}
          </>
        )}
      </section>

      <section id="health" className={adult.panel} aria-labelledby="me-health">
        <h2 id="me-health" className={adult.sectionTitle}>
          {th('title')}
        </h2>
        <p className={adult.muted}>{th('lead')}</p>
        {health === null ? (
          <Alert tone="error">{th('loadError')}</Alert>
        ) : (
          <ActionForm
            action={saveHealthAction.bind(null, locale, health.enabled)}
            className={adult.form}
          >
            <FormCheckbox
              id="health-enabled"
              name="enabled"
              label={th('enabled')}
              hint={health.enabled ? th('enabledOnHint') : th('enabledHint')}
              defaultChecked={health.enabled}
            />
            {health.enabled ? null : (
              <FormCheckbox
                id="health-consent"
                name="consent"
                label={th('consent')}
                hint={th('consentHint')}
              />
            )}
            <FormSelect
              id="health-prep"
              name="prepStatus"
              label={th('prep')}
              placeholder={th('prepNone')}
              options={PREP_STATUSES.map((value) => ({
                value,
                label: th(`prepStatuses.${value}`),
              }))}
              defaultValue={health.prepStatus ?? ''}
            />
            <FormInput
              id="health-month"
              name="lastTestedMonth"
              type="month"
              label={th('lastTested')}
              hint={th('lastTestedHint')}
              optionalLabel={th('optional')}
              min="2000-01"
              max={currentMonth()}
              placeholder="YYYY-MM"
              defaultValue={health.lastTestedMonth ?? ''}
            />
            <FormSelect
              id="health-reminder"
              name="reminderMonths"
              label={th('reminder')}
              hint={th('reminderHint')}
              placeholder={th('reminderNone')}
              options={REMINDER_MONTHS.map((value) => ({
                value: String(value),
                label: th('reminderEvery', { count: value }),
              }))}
              defaultValue={health.reminderMonths ? String(health.reminderMonths) : ''}
            />
            <FormCheckbox
              id="health-visible"
              name="visible"
              label={th('visible')}
              hint={th('visibleHint')}
              defaultChecked={health.visible}
            />
            <SubmitButton pendingLabel={th('saving')}>{th('save')}</SubmitButton>
          </ActionForm>
        )}
        <p>
          <Link href="/cruising/health" className={adult.inlineLink}>
            {th('findCenter')}
          </Link>
        </p>
      </section>
    </>
  );
}
