'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Link } from '@/i18n/navigation';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { initialFormState } from '@/lib/forms';
import { BUDGET_VALUES } from '@/lib/contact-options';
import { submitContact } from './actions';
import styles from './ContactForm.module.css';

/**
 * `renderedAt`: when the server rendered the form, sent back so too-fast submissions are spotted.
 * `showPrivacyNote`: the privacy policy is published, so the form links to it.
 */
export function ContactForm({
  renderedAt,
  showPrivacyNote = false,
}: {
  renderedAt: number;
  showPrivacyNote?: boolean;
}) {
  const t = useTranslations('Contact');
  const tc = useTranslations('Common');
  const locale = useLocale();
  const [state, formAction] = useActionState(submitContact, initialFormState);

  // Counts sent contact requests in the analytics (when Umami is loaded), tied to the page.
  useEffect(() => {
    if (state.status === 'success') window.umami?.track('contact-sent');
  }, [state.status]);

  if (state.status === 'success') {
    return (
      <Alert tone="success">
        <strong>{t('form.successTitle')}</strong> {t('form.successBody')}
      </Alert>
    );
  }

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="renderedAt" value={renderedAt} />

      <div className={styles.row}>
        <Input
          name="name"
          label={t('form.name')}
          autoComplete="name"
          required
          defaultValue={values.name}
          error={errors.name}
        />
        <Input
          name="email"
          type="email"
          label={t('form.email')}
          autoComplete="email"
          required
          defaultValue={values.email}
          error={errors.email}
        />
      </div>
      <div className={styles.row}>
        <Input
          name="company"
          label={t('form.company')}
          optionalLabel={tc('optional')}
          autoComplete="organization"
          defaultValue={values.company}
          error={errors.company}
        />
        <Select
          name="budget"
          label={t('form.budget')}
          optionalLabel={tc('optional')}
          placeholder={t('form.budgetPlaceholder')}
          options={BUDGET_VALUES.map((value) => ({ value, label: t(`budgets.${value}`) }))}
          defaultValue={values.budget ?? ''}
          error={errors.budget}
        />
      </div>
      <Textarea
        name="message"
        label={t('form.message')}
        hint={t('form.messageHint')}
        rows={7}
        required
        defaultValue={values.message}
        error={errors.message}
      />

      {/* Honeypot: hidden from people and assistive tech, tempting for bots. */}
      <div className="visually-hidden" aria-hidden="true">
        <label htmlFor="contact-website">{t('form.website')}</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {showPrivacyNote ? (
        <p className={styles.privacy}>
          {t.rich('form.privacyNote', {
            link: (chunks) => <Link href="/privacy">{chunks}</Link>,
          })}
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel={t('form.sending')}>{t('form.submit')}</SubmitButton>
      </div>
    </form>
  );
}
