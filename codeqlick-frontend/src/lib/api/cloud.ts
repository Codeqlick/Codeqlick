import 'server-only';
import { clientHeaders } from '@/lib/auth/refresh';
import { type CloudEventFilters, cloudEventFiltersQuery } from '@/lib/cloud';
import { env } from '@/lib/env';
import { apiFetch } from './client';
import { authHeader } from './projects';
import type { Paginated } from './types';

/** Codeqlick Cloud (architecture 4.13). Shapes mirror the API's cloud module. */

export type CloudRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type CloudTeam = {
  id: string;
  slug: string;
  name: string;
  plan: 'FREE' | 'PRO';
  role: CloudRole;
  createdAt: string;
};

export type CloudMe = {
  user: { id: string; name: string; email: string };
  via: 'session' | 'token';
  teams: Array<Pick<CloudTeam, 'id' | 'slug' | 'name' | 'role' | 'plan'>>;
  termsVersion: string;
};

export type CloudLimits = {
  teamsOwned: number;
  teamsJoined: number;
  projectsPerTeam: number;
  storageBytesPerTeam: number;
  deploymentBytes: number;
  deploymentFiles: number;
  uploadBytes: number;
  deploymentsPerHour: number;
  domainsPerProject: number;
  membersPerTeam: number;
  tokensPerPerson: number;
};

export type CloudUsage = {
  plan: 'FREE' | 'PRO';
  limits: CloudLimits;
  projects: number;
  storageBytes: number;
  deploymentsLastHour: number;
  members: number;
};

export type CloudDeployment = {
  id: string;
  shortId: string;
  url: string;
  target: 'preview' | 'production';
  isProduction: boolean;
  message: string | null;
  commit: string | null;
  branch: string | null;
  sizeBytes: number;
  fileCount: number;
  createdBy: { id: string; name: string } | null;
  viaToken: string | null;
  createdAt: string;
};

export type CloudDomainState = 'PENDING' | 'VERIFIED' | 'LIVE' | 'ERROR';

export type CloudProject = {
  id: string;
  slug: string;
  name: string;
  team: { slug: string; name: string };
  url: string;
  production: CloudDeployment | null;
  domains: Array<{ name: string; state: CloudDomainState }>;
  suspended: { at: string; reason: string } | null;
  createdAt: string;
};

export type CloudDomain = {
  id: string;
  name: string;
  state: CloudDomainState;
  dns: Array<{ type: 'TXT' | 'A' | 'CNAME'; name: string; value: string; ok: boolean }>;
  verifiedAt: string | null;
  checkedAt: string | null;
  lastError: string | null;
};

export type CloudMembers = {
  items: Array<{ userId: string; name: string; email: string; role: CloudRole; joinedAt: string }>;
  invites: Array<{ id: string; email: string; role: CloudRole; expiresAt: string }>;
};

export type CloudEvent = {
  id: string;
  action: string;
  actor: { id: string | null; name: string };
  token: string | null;
  targetLabel: string | null;
  details: unknown;
  ip: string | null;
  createdAt: string;
};

export type CloudToken = {
  id: string;
  name: string;
  prefix: string;
  team: { slug: string; name: string } | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
};

export type CloudInvite = {
  team: { name: string; slug: string };
  role: CloudRole;
  invitedBy: string | null;
  email: string;
  expiresAt: string;
  emailMatches: boolean;
};

export type CloudDevice = {
  userCode: string;
  clientName: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'denied';
};

export type CloudReportReason =
  'PHISHING' | 'MALWARE' | 'ILLEGAL' | 'COPYRIGHT' | 'SEXUAL' | 'SPAM' | 'OTHER';

const auth = { auth: 'required' } as const;
const write = { auth: 'required', forwardClientIp: true } as const;

export const getCloudMe = () => apiFetch<CloudMe>('/cloud/me', auth);

export const createCloudTeam = (input: {
  name: string;
  slug: string;
  acceptTerms: true;
  termsVersion: string;
}) => apiFetch<CloudTeam>('/cloud/teams', { ...write, method: 'POST', body: input });

export const getCloudTeam = (team: string) =>
  apiFetch<CloudTeam>(`/cloud/teams/${encodeURIComponent(team)}`, auth);

export const renameCloudTeam = (team: string, name: string) =>
  apiFetch<CloudTeam>(`/cloud/teams/${encodeURIComponent(team)}`, {
    ...write,
    method: 'PATCH',
    body: { name },
  });

export const deleteCloudTeam = (team: string) =>
  apiFetch<void>(`/cloud/teams/${encodeURIComponent(team)}`, { ...write, method: 'DELETE' });

export const getCloudUsage = (team: string) =>
  apiFetch<CloudUsage>(`/cloud/teams/${encodeURIComponent(team)}/usage`, auth);

export type { CloudEventFilters };

export const listCloudEvents = (team: string, page = 1, filters: CloudEventFilters = {}) =>
  apiFetch<Paginated<CloudEvent>>(`/cloud/teams/${encodeURIComponent(team)}/events`, {
    ...auth,
    query: { page, pageSize: 30, from: filters.from, to: filters.to, action: filters.action },
  });

/**
 * The API's response for a team's events as CSV (ADMIN), raw so the route handler can stream it
 * (apiFetch reads whole bodies). `incoming` are the visitor's request headers: their IP goes on,
 * as the API allows 10 exports an hour per IP. Undefined without a session.
 */
export async function exportCloudEvents(
  team: string,
  filters: CloudEventFilters,
  incoming: Headers,
): Promise<Response | undefined> {
  const authorization = await authHeader();
  if (!authorization) return undefined;
  const path = `/cloud/teams/${encodeURIComponent(team)}/events.csv`;
  return fetch(`${env.API_URL}${path}${cloudEventFiltersQuery(filters)}`, {
    headers: { ...clientHeaders(incoming), Authorization: authorization },
    cache: 'no-store',
    // A year of a busy team's events streams for a while.
    signal: AbortSignal.timeout(5 * 60_000),
  });
}

export const listCloudMembers = (team: string) =>
  apiFetch<CloudMembers>(`/cloud/teams/${encodeURIComponent(team)}/members`, auth);

export const inviteCloudMember = (
  team: string,
  input: { email: string; role: 'ADMIN' | 'MEMBER'; locale: 'en' | 'es' },
) =>
  apiFetch<unknown>(`/cloud/teams/${encodeURIComponent(team)}/invites`, {
    ...write,
    method: 'POST',
    body: input,
  });

export const revokeCloudInvite = (team: string, id: string) =>
  apiFetch<void>(`/cloud/teams/${encodeURIComponent(team)}/invites/${id}`, {
    ...write,
    method: 'DELETE',
  });

export const setCloudMemberRole = (team: string, userId: string, role: CloudRole) =>
  apiFetch<void>(`/cloud/teams/${encodeURIComponent(team)}/members/${userId}`, {
    ...write,
    method: 'PATCH',
    body: { role },
  });

export const removeCloudMember = (team: string, userId: string) =>
  apiFetch<void>(`/cloud/teams/${encodeURIComponent(team)}/members/${userId}`, {
    ...write,
    method: 'DELETE',
  });

export const getCloudInvite = (token: string) =>
  apiFetch<CloudInvite>(`/cloud/invites/${encodeURIComponent(token)}`, auth);

export const acceptCloudInvite = (token: string, termsVersion: string) =>
  apiFetch<{ team: { slug: string; name: string } }>(
    `/cloud/invites/${encodeURIComponent(token)}/accept`,
    { ...write, method: 'POST', body: { acceptTerms: true, termsVersion } },
  );

export const listCloudProjects = (team: string) =>
  apiFetch<{ items: CloudProject[] }>(`/cloud/teams/${encodeURIComponent(team)}/projects`, auth);

export const createCloudProject = (team: string, input: { name: string; slug: string }) =>
  apiFetch<CloudProject>(`/cloud/teams/${encodeURIComponent(team)}/projects`, {
    ...write,
    method: 'POST',
    body: input,
  });

export const renameCloudProject = (id: string, name: string) =>
  apiFetch<CloudProject>(`/cloud/projects/${id}`, { ...write, method: 'PATCH', body: { name } });

export const deleteCloudProject = (id: string) =>
  apiFetch<void>(`/cloud/projects/${id}`, { ...write, method: 'DELETE' });

export const listCloudDeployments = (id: string, page = 1) =>
  apiFetch<Paginated<CloudDeployment>>(`/cloud/projects/${id}/deployments`, {
    ...auth,
    query: { page, pageSize: 20 },
  });

export const promoteCloudDeployment = (id: string, deploymentId: string) =>
  apiFetch<CloudProject>(`/cloud/projects/${id}/deployments/${deploymentId}/promote`, {
    ...write,
    method: 'POST',
  });

export const deleteCloudDeployment = (id: string, deploymentId: string) =>
  apiFetch<void>(`/cloud/projects/${id}/deployments/${deploymentId}`, {
    ...write,
    method: 'DELETE',
  });

export const listCloudDomains = (id: string) =>
  apiFetch<{ items: CloudDomain[] }>(`/cloud/projects/${id}/domains`, auth);

export const addCloudDomain = (id: string, name: string) =>
  apiFetch<CloudDomain>(`/cloud/projects/${id}/domains`, {
    ...write,
    method: 'POST',
    body: { name },
  });

export const checkCloudDomain = (id: string, domainId: string) =>
  apiFetch<CloudDomain>(`/cloud/projects/${id}/domains/${domainId}/check`, {
    ...write,
    method: 'POST',
  });

export const removeCloudDomain = (id: string, domainId: string) =>
  apiFetch<void>(`/cloud/projects/${id}/domains/${domainId}`, { ...write, method: 'DELETE' });

export const listCloudTokens = () => apiFetch<{ items: CloudToken[] }>('/cloud/tokens', auth);

export const createCloudToken = (input: {
  name: string;
  teamSlug?: string;
  expiresInDays: 30 | 90 | 365 | null;
}) =>
  apiFetch<{ token: string; item: CloudToken }>('/cloud/tokens', {
    ...write,
    method: 'POST',
    body: input,
  });

export const revokeCloudToken = (id: string) =>
  apiFetch<void>(`/cloud/tokens/${id}`, { ...write, method: 'DELETE' });

export const getCloudDevice = (userCode: string) =>
  apiFetch<CloudDevice>(`/cloud/cli/device/${encodeURIComponent(userCode)}`, auth);

export const decideCloudDevice = (userCode: string, approve: boolean) =>
  apiFetch<void>(`/cloud/cli/device/${encodeURIComponent(userCode)}`, {
    ...write,
    method: 'POST',
    body: { approve },
  });

export const reportCloudPage = (input: {
  url: string;
  reason: CloudReportReason;
  details: string;
  email: string;
  website?: string;
}) =>
  apiFetch<void>('/cloud/reports', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });

// ── Admin ───────────────────────────────────────────────────────────────────────────────────

export type AdminCloudProject = {
  id: string;
  slug: string;
  name: string;
  team: { slug: string; name: string };
  url: string;
  storageBytes: number;
  deployments: number;
  domains: number;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
};

export type AdminCloudTeam = {
  id: string;
  slug: string;
  name: string;
  plan: 'FREE' | 'PRO';
  owners: Array<{ id: string; name: string; email: string }>;
  members: number;
  projects: number;
  storageBytes: number;
  createdAt: string;
};

export type AdminCloudReport = {
  id: string;
  url: string;
  reason: CloudReportReason;
  details: string;
  email: string;
  status: 'OPEN' | 'CLOSED';
  note: string | null;
  project: { id: string; slug: string; name: string; suspended: boolean } | null;
  createdAt: string;
  closedAt: string | null;
};

export const adminCloudProjects = (query: { q?: string; suspended?: boolean; page?: number }) =>
  apiFetch<Paginated<AdminCloudProject>>('/admin/cloud/projects', {
    ...auth,
    query: { q: query.q, suspended: query.suspended, page: query.page, pageSize: 30 },
  });

export const adminCloudTeams = (query: { q?: string; page?: number }) =>
  apiFetch<Paginated<AdminCloudTeam>>('/admin/cloud/teams', {
    ...auth,
    query: { q: query.q, page: query.page, pageSize: 30 },
  });

export const adminCloudReports = (status: 'OPEN' | 'CLOSED', page = 1) =>
  apiFetch<Paginated<AdminCloudReport>>('/admin/cloud/reports', {
    ...auth,
    query: { status, page, pageSize: 30 },
  });

export const suspendCloudProject = (id: string, reason: string) =>
  apiFetch<void>(`/admin/cloud/projects/${id}/suspend`, {
    ...write,
    method: 'POST',
    body: { reason },
  });

export const unsuspendCloudProject = (id: string) =>
  apiFetch<void>(`/admin/cloud/projects/${id}/suspension`, { ...write, method: 'DELETE' });

export const closeCloudReport = (id: string, note?: string) =>
  apiFetch<void>(`/admin/cloud/reports/${id}/close`, {
    ...write,
    method: 'POST',
    body: note ? { note } : {},
  });

// ── Forms (phase 1b) ────────────────────────────────────────────────────────────────────────

export type CloudForm = {
  id: string;
  name: string;
  key: string;
  endpoint: string;
  enabled: boolean;
  notify: boolean;
  recipientIds: string[];
  submissions: number;
  createdAt: string;
};

export type CloudSubmission = {
  id: string;
  data: Record<string, string>;
  email: string | null;
  page: string | null;
  createdAt: string;
};

export const listCloudForms = (projectId: string) =>
  apiFetch<{ items: CloudForm[] }>(`/cloud/projects/${projectId}/forms`, auth);

export const createCloudForm = (
  projectId: string,
  input: { name: string; notify: boolean; recipientIds: string[] },
) =>
  apiFetch<CloudForm>(`/cloud/projects/${projectId}/forms`, {
    ...write,
    method: 'POST',
    body: input,
  });

export const updateCloudForm = (
  projectId: string,
  formId: string,
  input: Partial<{ name: string; enabled: boolean; notify: boolean; recipientIds: string[] }>,
) =>
  apiFetch<CloudForm>(`/cloud/projects/${projectId}/forms/${formId}`, {
    ...write,
    method: 'PATCH',
    body: input,
  });

export const replaceCloudFormKey = (projectId: string, formId: string) =>
  apiFetch<CloudForm>(`/cloud/projects/${projectId}/forms/${formId}/key`, {
    ...write,
    method: 'POST',
  });

export const deleteCloudForm = (projectId: string, formId: string) =>
  apiFetch<void>(`/cloud/projects/${projectId}/forms/${formId}`, { ...write, method: 'DELETE' });

export type CloudNotifyKind = 'EMAIL' | 'SLACK' | 'DISCORD' | 'WEBHOOK';

/** A build notification channel (architecture 4.13, decision 43); its URL is never returned. */
export type CloudNotifyChannel = {
  id: string;
  name: string;
  kind: CloudNotifyKind;
  enabled: boolean;
  hint: string | null;
  recipientIds: string[];
  buildFailed: boolean;
  buildSucceeded: boolean;
  previews: boolean;
  locale: 'en' | 'es';
  failures: number;
  lastSentAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
  createdAt: string;
};

type NotifyEvents = {
  buildFailed: boolean;
  buildSucceeded: boolean;
  previews: boolean;
  locale: 'en' | 'es';
};

export const listCloudNotifications = (projectId: string) =>
  apiFetch<{ items: CloudNotifyChannel[] }>(`/cloud/projects/${projectId}/notifications`, auth);

export const createCloudNotification = (
  projectId: string,
  input: NotifyEvents & { name: string } & (
      | { kind: 'EMAIL'; recipientIds: string[] }
      | { kind: 'SLACK' | 'DISCORD' | 'WEBHOOK'; url: string }
    ),
) =>
  apiFetch<CloudNotifyChannel & { secret?: string }>(`/cloud/projects/${projectId}/notifications`, {
    ...write,
    method: 'POST',
    body: input,
  });

export const updateCloudNotification = (
  projectId: string,
  channelId: string,
  input: Partial<
    NotifyEvents & { name: string; enabled: boolean; url: string; recipientIds: string[] }
  >,
) =>
  apiFetch<CloudNotifyChannel>(`/cloud/projects/${projectId}/notifications/${channelId}`, {
    ...write,
    method: 'PATCH',
    body: input,
  });

export const deleteCloudNotification = (projectId: string, channelId: string) =>
  apiFetch<void>(`/cloud/projects/${projectId}/notifications/${channelId}`, {
    ...write,
    method: 'DELETE',
  });

export const testCloudNotification = (projectId: string, channelId: string) =>
  apiFetch<{ ok: boolean; error: string | null }>(
    `/cloud/projects/${projectId}/notifications/${channelId}/test`,
    { ...write, method: 'POST' },
  );

export const listCloudSubmissions = (
  projectId: string,
  formId: string,
  q: string | undefined,
  page = 1,
) =>
  apiFetch<Paginated<CloudSubmission>>(`/cloud/projects/${projectId}/forms/${formId}/submissions`, {
    ...auth,
    query: { q, page, pageSize: 20 },
  });

export const exportCloudSubmissions = (projectId: string, formId: string) =>
  apiFetch<string>(`/cloud/projects/${projectId}/forms/${formId}/submissions.csv`, {
    ...auth,
    responseType: 'text',
  });

export const deleteCloudSubmission = (projectId: string, formId: string, submissionId: string) =>
  apiFetch<void>(`/cloud/projects/${projectId}/forms/${formId}/submissions/${submissionId}`, {
    ...write,
    method: 'DELETE',
  });

// ── Monitors and status pages (phase 1b) ────────────────────────────────────────────────────

export type CloudMonitorState = 'UNKNOWN' | 'UP' | 'DOWN' | 'PAUSED';

export type CloudMonitor = {
  id: string;
  name: string;
  kind: 'HTTP' | 'HEARTBEAT';
  url: string | null;
  heartbeatUrl: string | null;
  periodMinutes: number | null;
  graceMinutes: number | null;
  projectId: string | null;
  enabled: boolean;
  status: CloudMonitorState;
  statusSince: string;
  lastCheckedAt: string | null;
  lastPingAt: string | null;
  deadlineAt: string | null;
  lastError: string | null;
  certExpiresAt: string | null;
  alertIds: string[];
  createdAt: string;
};

export type CloudDayUptime = { day: string; ratio: number | null };
export type CloudIncident = {
  start: string;
  end: string | null;
  minutes: number;
  error: string | null;
};

export type CloudMonitorDetail = CloudMonitor & {
  checks: Array<{
    at: string;
    ok: boolean;
    statusCode: number | null;
    responseMs: number | null;
    error: string | null;
  }>;
  uptime30: number | null;
  days: CloudDayUptime[];
  incidents: CloudIncident[];
};

export type CloudStatusPageSettings = {
  enabled: boolean;
  title: string;
  intro: string | null;
  items: Array<{ monitorId: string; label: string }>;
};

export type CloudPublicStatus = {
  title: string;
  intro: string | null;
  overall: 'operational' | 'partial' | 'major' | 'unknown';
  updatedAt: string;
  monitors: Array<{
    label: string;
    status: CloudMonitorState;
    uptime90: number | null;
    days: CloudDayUptime[];
    incidents: CloudIncident[];
  }>;
};

export const listCloudMonitors = (team: string) =>
  apiFetch<{ items: CloudMonitor[] }>(`/cloud/teams/${encodeURIComponent(team)}/monitors`, auth);

export const createCloudMonitor = (
  team: string,
  input:
    | { kind: 'HTTP'; name: string; url: string; alertIds: string[] }
    | {
        kind: 'HEARTBEAT';
        name: string;
        periodMinutes: number;
        graceMinutes: number;
        alertIds: string[];
      },
) =>
  apiFetch<CloudMonitor>(`/cloud/teams/${encodeURIComponent(team)}/monitors`, {
    ...write,
    method: 'POST',
    body: input,
  });

export const getCloudMonitor = (id: string) =>
  apiFetch<CloudMonitorDetail>(`/cloud/monitors/${id}`, auth);

export const updateCloudMonitor = (
  id: string,
  input: Partial<{ name: string; enabled: boolean; alertIds: string[] }>,
) => apiFetch<CloudMonitor>(`/cloud/monitors/${id}`, { ...write, method: 'PATCH', body: input });

export const deleteCloudMonitor = (id: string) =>
  apiFetch<void>(`/cloud/monitors/${id}`, { ...write, method: 'DELETE' });

export const getCloudStatusPage = (team: string) =>
  apiFetch<CloudStatusPageSettings>(`/cloud/teams/${encodeURIComponent(team)}/status-page`, auth);

export const saveCloudStatusPage = (team: string, input: CloudStatusPageSettings) =>
  apiFetch<CloudStatusPageSettings>(`/cloud/teams/${encodeURIComponent(team)}/status-page`, {
    ...write,
    method: 'PUT',
    body: { ...input, intro: input.intro ?? undefined },
  });

/** A team's public status (no session; the API caches it 60 s). */
export const getCloudPublicStatus = (team: string) =>
  apiFetch<CloudPublicStatus>(`/cloud/status/${encodeURIComponent(team)}`, { revalidate: 60 });

// ── Website check API (phase 1b) ────────────────────────────────────────────────────────────

export type CloudAuditReport = {
  id: string;
  url: string;
  finalUrl: string;
  score: number;
  categories: Array<{
    key: string;
    name: string;
    score: number;
    checks: Array<{ id: string; status: 'pass' | 'warn' | 'fail'; title: string; advice: string }>;
  }>;
  createdAt: string;
};

export const runCloudAudit = (input: { url: string; teamSlug: string; locale: 'en' | 'es' }) =>
  apiFetch<CloudAuditReport>('/cloud/audits', {
    ...write,
    method: 'POST',
    body: input,
    signal: AbortSignal.timeout(75_000),
  });

export const listCloudAudits = (team: string, page = 1) =>
  apiFetch<Paginated<{ id: string; url: string; score: number; createdAt: string }>>(
    `/cloud/teams/${encodeURIComponent(team)}/audits`,
    { ...auth, query: { page, pageSize: 20 } },
  );

export const getCloudAudit = (id: string, locale: 'en' | 'es') =>
  apiFetch<CloudAuditReport>(`/cloud/audits/${id}`, { ...auth, query: { locale } });

// ── Builds from Git (phase 2) ───────────────────────────────────────────────────────────────

export type CloudGit = {
  installationId: number | null;
  repoId: number | null;
  repo: string | null;
  branch: string;
  rootDir: string;
  installCommand: string;
  buildCommand: string;
  outputDir: string;
  nodeVersion: string;
  buildBranches: boolean;
  buildPullRequests: boolean;
};

export type CloudBuildStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';

export type CloudBuild = {
  id: string;
  number: number;
  trigger: 'push' | 'pull_request' | 'manual';
  target: 'preview' | 'production';
  branch: string;
  commit: string;
  commitMessage: string | null;
  author: string | null;
  pullRequest: number | null;
  status: CloudBuildStatus;
  error: string | null;
  deploymentId: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

export const getCloudGithubInstallUrl = (teamSlug: string, projectSlug?: string) =>
  apiFetch<{ url: string }>('/cloud/github/install-url', {
    ...auth,
    query: { teamSlug, projectSlug },
  });

export const linkCloudGithub = (input: { installationId: number; code: string; state: string }) =>
  apiFetch<{
    installation: { id: number; accountLogin: string };
    team: string | null;
    project: string | null;
  }>('/cloud/github/installations', { ...write, method: 'POST', body: input });

export const getCloudTeamGithub = (team: string) =>
  apiFetch<{
    configured: boolean;
    installations: Array<{
      id: number;
      accountLogin: string;
      accountType: string;
      suspended: boolean;
    }>;
  }>(`/cloud/teams/${encodeURIComponent(team)}/github`, auth);

export const listCloudGithubRepos = (team: string, installationId: number) =>
  apiFetch<{
    items: Array<{ id: number; fullName: string; defaultBranch: string; private: boolean }>;
  }>(`/cloud/teams/${encodeURIComponent(team)}/github/repos`, {
    ...auth,
    query: { installationId },
  });

export const getCloudGit = (projectId: string) =>
  apiFetch<CloudGit>(`/cloud/projects/${projectId}/git`, auth);

export const setCloudGit = (
  projectId: string,
  input: Partial<CloudGit> & { installationId: number; repoId: number; branch: string },
) =>
  apiFetch<CloudGit>(`/cloud/projects/${projectId}/git`, { ...write, method: 'PUT', body: input });

export const disconnectCloudGit = (projectId: string) =>
  apiFetch<void>(`/cloud/projects/${projectId}/git`, { ...write, method: 'DELETE' });

export const listCloudEnv = (projectId: string) =>
  apiFetch<{
    items: Array<{ key: string; production: boolean; preview: boolean; updatedAt: string }>;
  }>(`/cloud/projects/${projectId}/env`, auth);

export const setCloudEnv = (
  projectId: string,
  input: { key: string; value: string; production: boolean; preview: boolean },
) =>
  apiFetch<unknown>(`/cloud/projects/${projectId}/env`, { ...write, method: 'PUT', body: input });

export const deleteCloudEnv = (projectId: string, key: string) =>
  apiFetch<void>(`/cloud/projects/${projectId}/env`, {
    ...write,
    method: 'DELETE',
    query: { key },
  });

export const listCloudBuilds = (projectId: string, page = 1) =>
  apiFetch<Paginated<CloudBuild>>(`/cloud/projects/${projectId}/builds`, {
    ...auth,
    query: { page, pageSize: 20 },
  });

export const getCloudBuild = (projectId: string, number: number) =>
  apiFetch<CloudBuild & { log: string; logOffset: number }>(
    `/cloud/projects/${projectId}/builds/${number}`,
    auth,
  );

export const startCloudBuild = (projectId: string, branch?: string) =>
  apiFetch<CloudBuild>(`/cloud/projects/${projectId}/builds`, {
    ...write,
    method: 'POST',
    body: branch ? { branch } : {},
  });

export const cancelCloudBuild = (projectId: string, number: number) =>
  apiFetch<CloudBuild>(`/cloud/projects/${projectId}/builds/${number}/cancel`, {
    ...write,
    method: 'POST',
  });

// ── Web analytics (architecture 4.13 "Web analytics", decision 44) ──────────────────────────

export type CloudAnalyticsPeriod = '24h' | '7d' | '30d' | '90d' | '365d';
export type CloudAnalyticsRow = { key: string; visitors: number; count: number };

export type CloudAnalytics = {
  enabled: boolean;
  snippet: string;
  period: CloudAnalyticsPeriod;
  totals: { visitors: number; pageviews: number };
  series: Array<{ t: string; visitors: number; pageviews: number }>;
  pages: CloudAnalyticsRow[];
  referrers: CloudAnalyticsRow[];
  browsers: CloudAnalyticsRow[];
  os: CloudAnalyticsRow[];
  devices: CloudAnalyticsRow[];
  events: CloudAnalyticsRow[];
};

export const getCloudAnalytics = (projectId: string, period: CloudAnalyticsPeriod) =>
  apiFetch<CloudAnalytics>(`/cloud/projects/${projectId}/analytics`, {
    ...auth,
    query: { period },
  });

export const setCloudAnalytics = (projectId: string, enabled: boolean) =>
  apiFetch<{ enabled: boolean; snippet: string }>(`/cloud/projects/${projectId}/analytics`, {
    ...write,
    method: 'PATCH',
    body: { enabled },
  });

// ── Key-value store (architecture 4.13 "Key-value store", decision 45) ──────────────────────

export type CloudKvItem = {
  key: string;
  size: number;
  expiresAt: string | null;
  updatedAt: string;
};
export type CloudKvEntry = CloudKvItem & { value: unknown };
export type CloudKvList = {
  items: CloudKvItem[];
  cursor: string | null;
  usage: { keys: number; bytes: number; maxKeys: number; maxBytes: number };
};

const kvPath = (projectId: string, key: string) =>
  `/cloud/projects/${projectId}/kv/${encodeURIComponent(key)}`;

export const listCloudKv = (projectId: string, prefix?: string, cursor?: string) =>
  apiFetch<CloudKvList>(`/cloud/projects/${projectId}/kv`, {
    ...auth,
    query: { prefix: prefix || undefined, cursor: cursor || undefined, limit: 50 },
  });

export const getCloudKv = (projectId: string, key: string) =>
  apiFetch<CloudKvEntry>(kvPath(projectId, key), auth);

export const putCloudKv = (projectId: string, key: string, value: unknown, ttl?: number) =>
  apiFetch<CloudKvEntry>(kvPath(projectId, key), {
    ...write,
    method: 'PUT',
    body: { value, ttl },
  });

export const deleteCloudKv = (projectId: string, key: string) =>
  apiFetch<void>(kvPath(projectId, key), { ...write, method: 'DELETE' });

// ── Plans and billing (architecture 4.13 "Plans and billing", decision 46) ─────────────────

export type CloudBilling = {
  available: boolean;
  plan: 'FREE' | 'PRO';
  price: { amount: number; currency: string; interval: string | null; vatPercent: number } | null;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  limits: { FREE: Record<string, number>; PRO: Record<string, number> };
};

export const getCloudBilling = (team: string) =>
  apiFetch<CloudBilling>(`/cloud/teams/${encodeURIComponent(team)}/billing`, auth);

export const cloudBillingLink = (team: string, kind: 'checkout' | 'portal', locale: string) =>
  apiFetch<{ url: string }>(`/cloud/teams/${encodeURIComponent(team)}/billing/${kind}`, {
    ...write,
    method: 'POST',
    body: { locale },
  });

// ── Managed databases (architecture 4.13 "Databases", decision 47) ──────────────────────────

export type CloudDatabase = {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  sizeBytes: number;
  maxBytes: number;
  readOnly: boolean;
  blocked: boolean;
  connectionUrl: string;
  createdAt: string;
};

export const listCloudDatabases = (projectId: string) =>
  apiFetch<{ configured: boolean; items: CloudDatabase[] }>(
    `/cloud/projects/${projectId}/databases`,
    auth,
  );

export const createCloudDatabase = (projectId: string, name: string) =>
  apiFetch<CloudDatabase & { password: string }>(`/cloud/projects/${projectId}/databases`, {
    ...write,
    method: 'POST',
    body: { name },
  });

export const resetCloudDatabase = (projectId: string, id: string) =>
  apiFetch<CloudDatabase & { password: string }>(
    `/cloud/projects/${projectId}/databases/${id}/password`,
    { ...write, method: 'POST' },
  );

export const deleteCloudDatabase = (projectId: string, id: string) =>
  apiFetch<void>(`/cloud/projects/${projectId}/databases/${id}`, { ...write, method: 'DELETE' });

// ── Object storage (architecture 4.13 "Object storage", decision 48) ────────────────────────

export type CloudBucketKey = {
  id: string;
  name: string;
  accessKeyId: string;
  write: boolean;
  createdAt: string;
};

export type CloudBucket = {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  sizeBytes: number | null;
  objects: number | null;
  maxBytes: number;
  maxObjects: number;
  keys: CloudBucketKey[];
  createdAt: string;
};

export const listCloudBuckets = (projectId: string) =>
  apiFetch<{
    configured: boolean;
    endpoint: string | null;
    region: string | null;
    items: CloudBucket[];
  }>(`/cloud/projects/${projectId}/buckets`, auth);

export const createCloudBucket = (projectId: string, name: string) =>
  apiFetch<CloudBucket>(`/cloud/projects/${projectId}/buckets`, {
    ...write,
    method: 'POST',
    body: { name },
  });

export const deleteCloudBucket = (projectId: string, bucketId: string) =>
  apiFetch<void>(`/cloud/projects/${projectId}/buckets/${bucketId}`, {
    ...write,
    method: 'DELETE',
  });

export const createCloudBucketKey = (
  projectId: string,
  bucketId: string,
  input: { name: string; write: boolean },
) =>
  apiFetch<CloudBucketKey & { secretAccessKey: string }>(
    `/cloud/projects/${projectId}/buckets/${bucketId}/keys`,
    { ...write, method: 'POST', body: input },
  );

export const deleteCloudBucketKey = (projectId: string, bucketId: string, keyId: string) =>
  apiFetch<void>(`/cloud/projects/${projectId}/buckets/${bucketId}/keys/${keyId}`, {
    ...write,
    method: 'DELETE',
  });

// ── Disk guard (architecture 4.13 "Disk guard (one server)", decision 49) ─────────────────

export type AdminCloudDisk = {
  state: 'ok' | 'low' | 'full' | null;
  totalBytes: number | null;
  freeBytes: number | null;
  lowBytes: number;
  minBytes: number;
  deploymentsBytes: number;
  databasesBytes: number;
  bucketsBytes: number;
};

export const adminCloudDisk = () => apiFetch<AdminCloudDisk>('/admin/cloud/disk', auth);
