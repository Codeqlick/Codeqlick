'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Input, Textarea } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { slotsByDay, zoneCity } from '@/lib/citas';
import { initialFormState } from '@/lib/forms';
import { bookAction } from '../actions';
import styles from '../citas.module.css';

/**
 * Pick a day, then a time (in the page's time zone, with the visitor's own when it differs), then
 * who you are. A time taken meanwhile is reported and the visitor picks again.
 */
export function BookingForm({
  slug,
  slots,
  timeZone,
  askPhone,
  renderedAt,
}: {
  slug: string;
  slots: string[];
  timeZone: string;
  askPhone: boolean;
  renderedAt: number;
}) {
  const t = useTranslations('Citas.public');
  const tc = useTranslations('Common');
  const locale = useLocale();
  const tag = locale === 'es' ? 'es-ES' : 'en-GB';
  const [state, formAction] = useActionState(
    bookAction.bind(null, slug, askPhone),
    initialFormState,
  );
  const visitorZone =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : timeZone;
  const days = useMemo(() => slotsByDay(slots, timeZone), [slots, timeZone]);
  const [day, setDay] = useState(days[0]?.[0] ?? '');
  const [slot, setSlot] = useState('');

  const dayLabel = new Intl.DateTimeFormat(tag, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = new Intl.DateTimeFormat(tag, { timeZone, timeStyle: 'short' });
  const localTime = new Intl.DateTimeFormat(tag, { timeZone: visitorZone, timeStyle: 'short' });
  const fullLabel = new Intl.DateTimeFormat(tag, {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  });

  if (state.status === 'success') {
    const booked = state.values?.startsAt;
    return (
      <Alert tone="success">
        <strong>{t('doneTitle')}</strong>{' '}
        {booked ? t('doneBody', { when: fullLabel.format(new Date(booked)) }) : null}
        {state.values?.video ? ` ${t('doneVideo')}` : null}
      </Alert>
    );
  }

  if (days.length === 0) return <Alert tone="info">{t('noSlots')}</Alert>;

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const times = days.find(([key]) => key === day)?.[1] ?? [];
  const differentZone = visitorZone !== timeZone;

  return (
    <form action={formAction} className={styles.bookForm} noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="renderedAt" value={renderedAt} />
      <input type="hidden" name="startsAt" value={slot} />

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('dayQuestion')}</legend>
        <div className={styles.dayList}>
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
          {t('timeQuestion')}{' '}
          <small className={styles.zone}>{t('zone', { zone: zoneCity(timeZone) })}</small>
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
            name="phone"
            type="tel"
            label={t('phone')}
            optionalLabel={askPhone ? undefined : tc('optional')}
            required={askPhone}
            autoComplete="tel"
            defaultValue={values.phone}
            error={errors.phone}
          />
          <Textarea
            name="note"
            label={t('note')}
            optionalLabel={tc('optional')}
            rows={3}
            maxLength={500}
            defaultValue={values.note}
            error={errors.note}
          />
          <div>
            <SubmitButton pendingLabel={t('booking')}>{t('book')}</SubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}
