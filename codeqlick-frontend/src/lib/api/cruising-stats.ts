import 'server-only';
import { formatBbox, type Bbox } from '@/lib/cruising';
import type { CruisingStats } from '@/lib/cruising-stats';
import { apiFetch } from './client';
import type { CruisingSpotSummary } from './cruising';

/** Cruising phase 6 (architecture 4.15): admin statistics and the onboarding's suggestions. */

/** The last 12 weeks and the top places (decision 101), cached 10 minutes by the API. */
export function getAdminCruisingStats() {
  return apiFetch<CruisingStats>('/admin/cruising/stats', { auth: 'required' });
}

/**
 * Up to 12 LIVE spots to save as favourites (decision 102): near `box` (on the 0.25° grid) or, with
 * none, in my country.
 */
export async function listCruisingSuggestions(box?: Bbox | null): Promise<CruisingSpotSummary[]> {
  return (
    await apiFetch<{ items: CruisingSpotSummary[] }>('/cruising/suggestions', {
      query: { bbox: box ? formatBbox(box) : null },
      auth: 'required',
    })
  ).items;
}
