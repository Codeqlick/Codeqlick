'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Input, Textarea } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BOOKING_TIME_ZONE } from '@/lib/booking';
import { initialFormState } from '@/lib/forms';
import { bookCallAction } from './actions';
import styles from './Book.module.css';

/**
 * Pick a day, then a time (Madrid time, with the visitor's own time when it differs), then who you
 * are. The slots come from the server; a taken one is reported and the visitor picks again.
 */
export function BookingForm({ slots, renderedAt }: { slots: string[]; renderedAt: number }) {
  const t = useTranslations('Book');
  const tc = useTranslations('Common');
  const locale = useLocale();
  const tag = locale === 'es' ? 'es-ES' : 'en-GB';
  const [state, formAction] = useActionState(bookCallAction, initialFormState);
  const visitorZone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : BOOKING_TIME_ZONE;

  // Slots by Madrid day, in order.
  const days = useMemo(() => {
    const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: BOOKING_TIME_ZONE });
    const map = new Map<string, string[]>();
    for (const slot of slots) {
      const key = dayKey.format(new Date(slot));
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return [...map.entries()];
  }, [slots]);

  const [day, setDay] = useState(days[0]?.[0] ?? '');
  const [slot, setSlot] = useState('');

  const dayLabel = new Intl.DateTimeFormat(tag, {
    timeZone: BOOKING_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = new Intl.DateTimeFormat(tag, {
    timeZone: BOOKING_TIME_ZONE,
    timeStyle: 'short',
  });
  const localTime = new Intl.DateTimeFormat(tag, { timeZone: visitorZone, timeStyle: 'short' });
  const fullLabel = new Intl.DateTimeFormat(tag, {
    timeZone: BOOKING_TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  });

  if (state.status === 'success') {
    const booked = state.values?.startsAt;
    return (
      <Alert tone="success">
        <strong>{t('doneTitle')}</strong>{' '}
        {booked ? t('doneBody', { when: fullLabel.format(new Date(booked)) }) : t('doneBodyShort')}
      </Alert>
    );
  }

  if (days.length === 0) return <Alert tone="info">{t('noSlots')}</Alert>;

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const times = days.find(([key]) => key === day)?.[1] ?? [];
  const differentZone = visitorZone !== BOOKING_TIME_ZONE;

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="renderedAt" value={renderedAt} />
      <input type="hidden" name="startsAt" value={slot} />

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('dayQuestion')}</legend>
        <div className={styles.days}>
          {days.map(([key, daySlots]) => (
            <button
              key={key}
              type="button"
              className={`${styles.day} ${key === day ? styles.selected : ''}`}
              aria-pressed={key === day}
              onClick={() => {
                setDay(key);
                setSlot('');
              }}
            >
              <span>{dayLabel.format(new Date(daySlots[0]!))}</span>
              <small>{t('freeCount', { count: daySlots.length })}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>
          {t('timeQuestion')} <small className={styles.zone}>{t('madridTime')}</small>
        </legend>
        <div className={styles.times}>
          {times.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.time} ${value === slot ? styles.selected : ''}`}
              aria-pressed={value === slot}
              onClick={() => setSlot(value)}
            >
              {timeLabel.format(new Date(value))}
              {differentZone ? (
                <small>{t('yourTime', { time: localTime.format(new Date(value)) })}</small>
              ) : null}
            </button>
          ))}
        </div>
        {errors.startsAt ? <p className={styles.error}>{t('pickTime')}</p> : null}
      </fieldset>

      {slot ? (
        <div className={styles.details}>
          <p className={styles.chosen}>{t('chosen', { when: fullLabel.format(new Date(slot)) })}</p>
          {/* Honeypot: hidden from people, filled in by bots. */}
          <div className={styles.trap} aria-hidden="true">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <div className={styles.row}>
            <Input
              name="name"
              label={t('name')}
              autoComplete="name"
              required
              defaultValue={values.name}
              error={errors.name}
            />
            <Input
              name="email"
              type="email"
              label={t('email')}
              autoComplete="email"
              required
              defaultValue={values.email}
              error={errors.email}
            />
          </div>
          <Input
            name="company"
            label={t('company')}
            optionalLabel={tc('optional')}
            autoComplete="organization"
            defaultValue={values.company}
            error={errors.company}
          />
          <Textarea
            name="message"
            label={t('message')}
            optionalLabel={tc('optional')}
            hint={t('messageHint')}
            rows={4}
            defaultValue={values.message}
            error={errors.message}
          />
          <div>
            <SubmitButton pendingLabel={t('booking')}>{t('book')}</SubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}
