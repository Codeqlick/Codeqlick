'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import { adminUpdateLead } from '@/lib/api/leads';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/api/types';

/** Moves a lead to another column of the board. Resolves to false when it couldn't be saved. */
export async function moveLeadAction(
  locale: AppLocale,
  id: string,
  status: LeadStatus,
): Promise<boolean> {
  if (!LEAD_STATUSES.includes(status)) return false;
  try {
    await adminUpdateLead(id, { status });
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    return false;
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  return true;
}
