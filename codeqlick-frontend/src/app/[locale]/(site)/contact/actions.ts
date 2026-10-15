'use server';

import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { createLead } from '@/lib/api/leads';
import { formObject, formString, formValues, zodFieldErrors, type FormState } from '@/lib/forms';
import { CONTACT_FIELDS, contactSchema } from '@/lib/schemas/contact';

/**
 * Nobody types a name, an email and a message this fast: quicker submissions come from bots,
 * which also tend to post without the timestamp the page renders into the form.
 */
const MIN_FILL_MS = 3000;

function looksAutomated(formData: FormData): boolean {
  if (formString(formData, 'website') !== '') return true;
  const renderedAt = Number(formString(formData, 'renderedAt'));
  return !Number.isFinite(renderedAt) || renderedAt <= 0 || Date.now() - renderedAt < MIN_FILL_MS;
}

/** Contact form → POST /v1/leads. Returns translated form and field errors for useActionState. */
export async function submitContact(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Contact.form' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });

  // Honeypot or too fast: bots get a success message and nothing is sent.
  if (looksAutomated(formData)) {
    console.warn('Contact form submission discarded as automated');
    return { status: 'success' };
  }

  const values = formValues(formData, ['website', 'locale', 'renderedAt']);
  const parsed = contactSchema.safeParse(formObject(formData, CONTACT_FIELDS));
  if (!parsed.success) {
    return {
      status: 'error',
      message: t('error'),
      fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)),
      values,
    };
  }

  const { name, email, company, projectType, message } = parsed.data;
  try {
    await createLead({
      name,
      email,
      company: company || undefined,
      projectType: projectType || undefined,
      message,
      locale,
    });
  } catch (error) {
    if (isApiError(error) && error.status === 429) {
      return { status: 'error', message: t('rateLimited'), values };
    }
    return {
      status: 'error',
      message: t('error'),
      fieldErrors: isApiError(error) ? error.fieldErrors : undefined,
      values,
    };
  }

  return { status: 'success' };
}
