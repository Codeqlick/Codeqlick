'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { Link } from '@/i18n/navigation';
import {
  CALCULATOR_EXTRAS,
  CALCULATOR_SIZES,
  estimate,
  pricedTypes,
  type CalculatorConfig,
  type CalculatorExtra,
  type CalculatorSize,
  type CalculatorType,
} from '@/lib/calculator';
import styles from './Calculator.module.css';

/** The interactive estimate: type, size and extras on one side, the range on the other. */
export function Calculator({ config }: { config: CalculatorConfig }) {
  const t = useTranslations('Calculator');
  const tt = useTranslations('Contact.projectTypes');
  const locale = useLocale();
  const types = pricedTypes(config);
  const [type, setType] = useState<CalculatorType>(types[0] ?? 'web');
  const [size, setSize] = useState<CalculatorSize>('medium');
  const [extras, setExtras] = useState<CalculatorExtra[]>([]);
  // Extras the team gave no price add nothing: they aren't offered.
  const offeredExtras = CALCULATOR_EXTRAS.filter((key) => config.extras[key].max > 0);

  const result = estimate(config, { type, size, extras });
  const money = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
  const range = `${money.format(result.min)} – ${money.format(result.max)}`;
  const weeks =
    result.weeksMin === result.weeksMax
      ? t('weeksOne', { weeks: result.weeksMin })
      : t('weeksRange', { min: result.weeksMin, max: result.weeksMax });

  // The contact form opens with the type chosen and the estimate written in the message.
  const summary = [
    t('summaryIntro'),
    `- ${t('typeLabel')}: ${tt(type)}`,
    `- ${t('sizeLabel')}: ${t(`sizes.${size}.label`)}`,
    ...(extras.length > 0
      ? [`- ${t('extrasLabel')}: ${extras.map((key) => t(`extras.${key}`)).join(', ')}`]
      : []),
    `- ${t('estimateLabel')}: ${range} · ${weeks}`,
    '',
    '',
  ].join('\n');
  const contactHref = `/contact?${new URLSearchParams({ type, message: summary }).toString()}`;

  return (
    <div className={styles.calculator}>
      <div className={styles.questions}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>
            <span className={styles.step}>1</span> {t('typeQuestion')}
          </legend>
          <div className={styles.options}>
            {types.map((key) => (
              <label key={key} className={styles.option}>
                <input
                  type="radio"
                  name="type"
                  value={key}
                  checked={type === key}
                  onChange={() => setType(key)}
                />
                <span>{tt(key)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>
            <span className={styles.step}>2</span> {t('sizeQuestion')}
          </legend>
          <div className={styles.options}>
            {CALCULATOR_SIZES.map((key) => (
              <label key={key} className={`${styles.option} ${styles.sizeOption}`}>
                <input
                  type="radio"
                  name="size"
                  value={key}
                  checked={size === key}
                  onChange={() => setSize(key)}
                />
                <strong className={styles.optionText}>{t(`sizes.${key}.label`)}</strong>
                <small className={styles.optionText}>{t(`sizes.${key}.hint`)}</small>
              </label>
            ))}
          </div>
        </fieldset>

        {offeredExtras.length > 0 ? (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>
              <span className={styles.step}>3</span> {t('extrasQuestion')}
            </legend>
            <div className={styles.options}>
              {offeredExtras.map((key) => (
                <label key={key} className={styles.option}>
                  <input
                    type="checkbox"
                    name="extras"
                    value={key}
                    checked={extras.includes(key)}
                    onChange={(event) =>
                      setExtras((current) =>
                        event.target.checked
                          ? [...current, key]
                          : current.filter((other) => other !== key),
                      )
                    }
                  />
                  <span>{t(`extras.${key}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      <aside className={styles.result} aria-live="polite">
        <p className={styles.resultLabel}>{t('resultLabel')}</p>
        <p className={styles.range}>{range}</p>
        <p className={styles.weeks}>{weeks}</p>
        <p className={styles.note}>{t('note')}</p>
        <Link href={contactHref} className={buttonClassName({ variant: 'primary', block: true })}>
          {t('cta')}
        </Link>
      </aside>
    </div>
  );
}
