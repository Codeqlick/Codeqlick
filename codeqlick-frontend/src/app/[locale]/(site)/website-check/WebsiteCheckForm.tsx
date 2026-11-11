'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Checkbox, Input } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { initialFormState } from '@/lib/forms';
import { requestWebsiteCheck } from './actions';
import styles from './website-check.module.css';

/** The free website check's form; a sent request opens its report page. */
export function WebsiteCheckForm({ renderedAt }: { renderedAt: number }) {
  const t = useTranslations('WebsiteCheck.form');
  const tc = useTranslations('Common');
  const locale = useLocale();
  const [state, formAction] = useActionState(requestWebsiteCheck, initialFormState);

  if (state.status === 'success') {
    return <Alert tone="success">{t('sent')}</Alert>;
  }

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="renderedAt" value={renderedAt} />
      <Input
        name="url"
        type="text"
        inputMode="url"
        label={t('url')}
        placeholder={t('urlPlaceholder')}
        autoComplete="url"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={values.url}
        error={errors.url}
      />
      <div className={styles.row}>
        <Input
          name="email"
          type="email"
          label={t('email')}
          hint={t('emailHint')}
          autoComplete="email"
          required
          defaultValue={values.email}
          error={errors.email}
        />
        <Input
          name="name"
          label={t('name')}
          optionalLabel={tc('optional')}
          autoComplete="name"
          defaultValue={values.name}
          error={errors.name}
        />
      </div>
      <Checkbox
        name="acceptPrivacy"
        label={t.rich('acceptPrivacy', {
          link: (chunks) => (
            <Link href="/privacy" target="_blank">
              {chunks}
            </Link>
          ),
        })}
        required
        error={errors.acceptPrivacy}
      />
      {/* Honeypot: hidden from people and assistive tech, tempting for bots. */}
      <div className="visually-hidden" aria-hidden="true">
        <label htmlFor="check-website">{t('honeypot')}</label>
        <input id="check-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <SubmitButton pendingLabel={t('sending')} trackEvent="website-check-sent">
          {t('submit')}
        </SubmitButton>
      </div>
    </form>
  );
}
