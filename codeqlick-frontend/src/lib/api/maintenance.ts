import 'server-only';
import { apiFetch } from './client';
import type {
  AdminMaintenanceView,
  MaintenanceList,
  MaintenanceOffer,
  MaintenanceView,
} from '../maintenance';

const portalPath = (projectId: string) =>
  `/portal/projects/${encodeURIComponent(projectId)}/maintenance`;
const adminPath = (projectId: string) =>
  `/admin/projects/${encodeURIComponent(projectId)}/maintenance`;

/** The plan for the landing (architecture 8.2, decision 110); cached like public content. */
export function getMaintenanceOffer() {
  return apiFetch<MaintenanceOffer>('/site-maintenance/offer', { revalidate: 300 });
}

/** A project's plan for its client; 404 without a managed site. */
export function getMyMaintenance(projectId: string) {
  return apiFetch<MaintenanceView>(portalPath(projectId), { auth: 'required' });
}

/** Stripe's address: Checkout to take the plan, or the customer portal to manage it. */
export function maintenanceLink(projectId: string, kind: 'checkout' | 'portal', locale: string) {
  return apiFetch<{ url: string }>(`${portalPath(projectId)}/${kind}`, {
    method: 'POST',
    body: { locale },
    auth: 'required',
    forwardClientIp: true,
  });
}

export function adminGetMaintenance(projectId: string) {
  return apiFetch<AdminMaintenanceView>(adminPath(projectId), { auth: 'required' });
}

/** Marks the plan included for free with why, or (null) removes it. */
export function adminSetMaintenanceIncluded(projectId: string, reason: string | null) {
  return apiFetch<AdminMaintenanceView>(`${adminPath(projectId)}/included`, {
    method: 'PUT',
    body: { reason },
    auth: 'required',
  });
}

export function adminListMaintenance() {
  return apiFetch<MaintenanceList>('/admin/maintenance', { auth: 'required' });
}
