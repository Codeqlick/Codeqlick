'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState } from '@/lib/actions';
import { adminSavePlan } from '@/lib/api/plans';
import { formBoolean, formObject, type FormState } from '@/lib/forms';
import { requiredString } from '@/lib/schemas/common';

const planSchema = z.object({
  name: requiredString(120),
  /** Hours a month, decimals allowed ("7,5"). */
  hours: z
    .string()
    .trim()
    .transform((value) => Number(value.replace(',', '.')))
    .refine((value) => Number.isFinite(value) && value >= 1 && value <= 1000, 'number'),
  alertPercent: z.coerce.number('number').int('number').min(10, 'number').max(99, 'number'),
});

export async function savePlanAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = planSchema.safeParse(formObject(formData, ['name', 'hours', 'alertPercent']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminSavePlan(projectId, {
      active: formBoolean(formData, 'active'),
      name: parsed.data.name,
      monthlyMinutes: Math.round(parsed.data.hours * 60),
      alertPercent: parsed.data.alertPercent,
    });
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
  return savedState(locale);
}
