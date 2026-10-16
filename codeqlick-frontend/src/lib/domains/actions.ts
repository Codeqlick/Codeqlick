'use server';

import { isApiError } from '@/lib/api/errors';
import { checkDomainAvailability } from '@/lib/api/domains';
import type { DomainAvailability } from '@/lib/api/types';

/** For DomainField: whether the domains for a typed name are free (architecture 8.2). */
export async function checkDomainAction(
  name: string,
): Promise<{ results: DomainAvailability[] } | { error: 'invalid' | 'failed' }> {
  const value = name.trim().slice(0, 253);
  if (!value) return { error: 'invalid' };
  try {
    return await checkDomainAvailability(value);
  } catch (error) {
    return { error: isApiError(error) && error.status === 400 ? 'invalid' : 'failed' };
  }
}
