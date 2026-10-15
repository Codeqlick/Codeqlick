import 'server-only';
import type { CalculatorConfig } from '@/lib/calculator';
import { apiFetch } from './client';
import { PUBLIC_REVALIDATE } from './posts';

/** The published calculator's prices, or null while it isn't published (or the API is down). */
export async function getCalculator(): Promise<CalculatorConfig | null> {
  try {
    return await apiFetch<CalculatorConfig>('/calculator', { revalidate: PUBLIC_REVALIDATE });
  } catch {
    // Not published (404) or unreachable: the site simply doesn't offer it.
    return null;
  }
}

export function adminGetCalculator() {
  return apiFetch<CalculatorConfig>('/admin/calculator', { auth: 'required' });
}

export function adminSaveCalculator(config: CalculatorConfig) {
  return apiFetch<CalculatorConfig>('/admin/calculator', {
    method: 'PUT',
    body: config,
    auth: 'required',
  });
}
