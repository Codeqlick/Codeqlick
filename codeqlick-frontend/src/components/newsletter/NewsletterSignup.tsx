'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Checkbox, Input } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { initialFormState } from '@/lib/forms';
import { subscribeAction } from './actions';
import styles from './NewsletterSignup.module.css';

/**
 * "Get new posts by email": the blog's newsletter sign-up (architecture 4.14). Double opt-in, so
 * success only asks the reader to check their inbox. Bots meet the contact form's two traps: a
 * honeypot and the 3-second rule (the time is stamped in the browser, which keeps the blog pages
 * cacheable).
 */
export function NewsletterSignup({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const t = useTranslations('Newsletter');
  const locale = useLocale();
  const id = useId();
  const [state, formAction] = useActionState(subscribeAction, initialFormState);
  // Stamped straight into the hidden field (no state, so no extra render).
  const renderedAt = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renderedAt.current) renderedAt.current.value = String(Date.now());
  }, []);

  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <section className={styles.box} aria-labelledby={`${id}-title`}>
      <Heading id={`${id}-title`} className={styles.title}>
        {t('title')}
      </Heading>
      <p className={styles.lead}>{t('lead')}</p>
      {state.status === 'success' ? (
        <Alert tone="success">
          <strong>{t('successTitle')}</strong> {t('successBody')}
        </Alert>
      ) : (
        <form action={formAction} className={styles.form} noValidate>
          {state.message ? <Alert tone="error">{state.message}</Alert> : null}
          <input type="hidden" name="locale" value={locale} />
          <input ref={renderedAt} type="hidden" name="renderedAt" defaultValue="0" />
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            label={t('email')}
            placeholder={t('emailPlaceholder')}
            autoComplete="email"
            required
            defaultValue={values.email}
            error={errors.email}
          />
          <Checkbox
            id={`${id}-privacy`}
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
            <label htmlFor={`${id}-website`}>{t('honeypot')}</label>
            <input
              id={`${id}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          <div>
            <SubmitButton pendingLabel={t('submitting')} trackEvent="newsletter-signup">
              {t('submit')}
            </SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
