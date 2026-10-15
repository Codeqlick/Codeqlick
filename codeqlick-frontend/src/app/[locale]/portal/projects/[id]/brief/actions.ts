'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { saveMyBrief } from '@/lib/api/briefs';
import { BRIEF_FIELDS, type BriefAnswers } from '@/lib/brief';
import { formString, formText, type FormState } from '@/lib/forms';

/** Saves the answers ("Guardar") or sends them ("Enviar"). API paths `answers.x` → field `x`. */
export async function saveBriefAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const submit = formString(formData, 'intent') === 'submit';
  const answers: BriefAnswers = {};
  for (const field of BRIEF_FIELDS) {
    const value = formText(formData, field.key).trim();
    if (value !== '') answers[field.key] = value;
  }
  try {
    await saveMyBrief(projectId, answers, submit);
  } catch (error) {
    const state = await failedState(error, locale, formData, (path) =>
      path.replace(/^answers\./, ''),
    );
    if (submit && state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      const t = await getTranslations({ locale, namespace: 'Brief' });
      // Saved anyway: only sending needs the essential answers.
      await saveMyBrief(projectId, answers, false).catch(() => undefined);
      return {
        ...state,
        message: t('missing'),
        fieldErrors: Object.fromEntries(
          Object.keys(state.fieldErrors).map((key) => [key, t('required')]),
        ),
      };
    }
    return state;
  }
  revalidatePath(`/${locale}/portal`, 'layout');
  revalidatePath(`/${locale}/admin`, 'layout');
  const t = await getTranslations({ locale, namespace: 'Brief' });
  return { status: 'success', message: submit ? t('sent') : t('saved') };
}
