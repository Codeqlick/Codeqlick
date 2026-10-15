import 'server-only';
import { apiFetch } from './client';
import type { ActivityEntry, ActivityTarget, Paginated } from './types';

export function adminListActivity(
  params: { targetType?: ActivityTarget; page?: number; pageSize?: number } = {},
) {
  return apiFetch<Paginated<ActivityEntry>>('/admin/activity', {
    auth: 'required',
    query: { targetType: params.targetType, page: params.page, pageSize: params.pageSize },
  });
}
