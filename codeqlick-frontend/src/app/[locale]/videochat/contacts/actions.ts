'use server';

import { revalidatePath } from 'next/cache';
import { localeOrDefault } from '@/i18n/locale';
import { removeVideochatContact } from '@/lib/api/videochat';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Removes a contact (DELETE /videochat/contacts/:id). */
export async function removeContactAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const contactId = String(formData.get('contactId') ?? '');
  if (!UUID.test(contactId)) return;
  await removeVideochatContact(contactId);
  revalidatePath(`/${locale}/videochat/contacts`);
}
