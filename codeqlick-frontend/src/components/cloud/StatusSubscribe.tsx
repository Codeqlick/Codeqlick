'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Checkbox, Input } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { STATUS_SUBSCRIBERS_ANCHOR } from '@/content/legal/anchors';
import { Link } from '@/i18n/navigation';
import { initialFormState } from '@/lib/forms';
import { subscribeToStatusAction } from './status-subscribe-actions';
import styles from './StatusSubscribe.module.css';

/**
 * "Get updates by email" on a team's public status page (architecture 4.13, decision 105). Double
 * opt-in, so success only asks to check the inbox. The newsletter's bot traps: a honeypot and the
 * 3-second rule (the time is stamped in the browser). Under the form, who is responsible for the
 * address (the team), Codeqlick's privacy policy and that unsubscribing is always one click.
 */
export function StatusSubscribe({ team, teamName }: { team: string; teamName: string }) {
  const t = useTranslations('Cloud.subscribe');
  const locale = useLocale();
  const id = useId();
  const [state, formAction] = useActionState(
    subscribeToStatusAction.bind(null, team),
    initialFormState,
  );
  const renderedAt = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renderedAt.current) renderedAt.current.value = String(Date.now());
  }, []);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <section className={styles.box} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.title}>
        {t('title')}
      </h2>
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
            id={`${id}-accept`}
            name="acceptPrivacy"
            label={t('accept')}
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
            <SubmitButton pendingLabel={t('submitting')}>{t('submit')}</SubmitButton>
          </div>
        </form>
      )}
      <p className={styles.notice}>
        {t.rich('notice', {
          team: teamName,
          link: (chunks) => (
            <Link
              href={`/privacy#${STATUS_SUBSCRIBERS_ANCHOR[locale === 'es' ? 'es' : 'en']}`}
              target="_blank"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
