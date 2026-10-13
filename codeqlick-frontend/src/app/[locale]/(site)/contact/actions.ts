'use server';

import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { createLead } from '@/lib/api/leads';
import { formObject, formString, formValues, zodFieldErrors, type FormState } from '@/lib/forms';
import { CONTACT_FIELDS, contactSchema } from '@/lib/schemas/contact';

/** Contact form → POST /v1/leads. Returns translated form and field errors for useActionState. */
export async function submitContact(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Contact.form' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });

  // Honeypot: bots that fill the hidden field get a success message and nothing is sent.
  if (formString(formData, 'website') !== '') return { status: 'success' };

  const values = formValues(formData, ['website', 'locale']);
  const parsed = contactSchema.safeParse(formObject(formData, CONTACT_FIELDS));
  if (!parsed.success) {
    return {
      status: 'error',
      message: t('error'),
      fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)),
      values,
    };
  }

  const { name, email, company, budget, message } = parsed.data;
  try {
    await createLead({
      name,
      email,
      company: company || undefined,
      budget: budget || undefined,
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
