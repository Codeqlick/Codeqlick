'use server';

import { revalidatePath } from 'next/cache';
import { localeOrDefault } from '@/i18n/locale';
import { closeCloudReport, suspendCloudProject, unsuspendCloudProject } from '@/lib/api/cloud';
import { formString } from '@/lib/forms';

/** Suspends a Cloud project (its owners are emailed the reason). */
export async function suspendAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const reason = formString(formData, 'reason');
  if (reason.length >= 5) {
    await suspendCloudProject(formString(formData, 'id'), reason.slice(0, 500)).catch(
      () => undefined,
    );
  }
  revalidatePath(`/${locale}/admin/cloud`);
}

export async function unsuspendAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await unsuspendCloudProject(formString(formData, 'id')).catch(() => undefined);
  revalidatePath(`/${locale}/admin/cloud`);
}

export async function closeReportAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const note = formString(formData, 'note').slice(0, 1000);
  await closeCloudReport(formString(formData, 'id'), note || undefined).catch(() => undefined);
  revalidatePath(`/${locale}/admin/cloud`);
}
