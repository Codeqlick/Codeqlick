'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState, savedState } from '@/lib/actions';
import { adminSaveCalculator } from '@/lib/api/calculator';
import {
  CALCULATOR_EXTRAS,
  CALCULATOR_SIZES,
  CALCULATOR_TYPES,
  type CalculatorConfig,
} from '@/lib/calculator';
import { formBoolean, formValues, type FormState } from '@/lib/forms';

/** A whole number from the form ("1.500" and "1500" alike); empty or unreadable is 0. */
function whole(formData: FormData, name: string): number {
  const raw = String(formData.get(name) ?? '')
    .replace(/[.\s€]/g, '')
    .replace(',', '.');
  const value = Math.round(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function factor(formData: FormData, name: string): number {
  const value = Number(String(formData.get(name) ?? '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export async function saveCalculatorAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const config: CalculatorConfig = {
    enabled: formBoolean(formData, 'enabled'),
    types: Object.fromEntries(
      CALCULATOR_TYPES.map((key) => [
        key,
        {
          min: whole(formData, `${key}.min`),
          max: whole(formData, `${key}.max`),
          weeksMin: whole(formData, `${key}.weeksMin`),
          weeksMax: whole(formData, `${key}.weeksMax`),
        },
      ]),
    ) as CalculatorConfig['types'],
    sizes: Object.fromEntries(
      CALCULATOR_SIZES.map((key) => [key, factor(formData, `size.${key}`)]),
    ) as CalculatorConfig['sizes'],
    extras: Object.fromEntries(
      CALCULATOR_EXTRAS.map((key) => [
        key,
        { min: whole(formData, `extra.${key}.min`), max: whole(formData, `extra.${key}.max`) },
      ]),
    ) as CalculatorConfig['extras'],
  };

  try {
    await adminSaveCalculator(config);
  } catch (error) {
    return { ...(await failedState(error, locale, formData)), values: formValues(formData) };
  }
  revalidatePath(`/${locale}`, 'layout');
  return savedState(locale);
}
