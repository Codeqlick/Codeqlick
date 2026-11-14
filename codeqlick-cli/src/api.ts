import { openAsBlob } from 'node:fs';
import { VERSION } from './version.ts';

/** A failed API call: the problem details' text and status. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  plan: string;
}

export interface Me {
  user: { id: string; name: string; email: string };
  via: 'session' | 'token';
  token: { id: string; name: string; teamId: string | null } | null;
  teams: Team[];
}

export interface Deployment {
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
}

export interface DeploymentFile {
  path: string;
  size: number;
}

export interface DeploymentFiles {
  items: DeploymentFile[];
  count: number;
  totalBytes: number;
}

export interface DeploymentComparison {
  deploymentId: string;
  withId: string;
  added: DeploymentFile[];
  removed: DeploymentFile[];
  changed: Array<DeploymentFile & { previousSize: number }>;
  unchanged: number;
  totalBytes: number;
  withTotalBytes: number;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  team: { slug: string; name: string };
  url: string;
  production: Deployment | null;
  domains: Array<{ name: string; state: string }>;
  suspended: { at: string; reason: string } | null;
}

export interface Domain {
  id: string;
  name: string;
  state: 'PENDING' | 'VERIFIED' | 'LIVE' | 'ERROR';
  dns: Array<{ type: string; name: string; value: string; ok: boolean }>;
  lastError: string | null;
}

export interface AuditReport {
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
}

export interface GitSettings {
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
}

export interface GitSettingsInput {
  installationId: number;
  repoId: number;
  branch: string;
  rootDir?: string;
  installCommand?: string;
  buildCommand?: string;
  outputDir?: string;
  nodeVersion?: string;
}

export interface TeamGithub {
  configured: boolean;
  installations: Array<{
    id: number;
    accountLogin: string;
    accountType: string;
    suspended: boolean;
  }>;
}

export interface GithubRepo {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface EnvVar {
  key: string;
  production: boolean;
  preview: boolean;
  updatedAt: string;
}

export type BuildStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';

export interface Build {
  id: string;
  number: number;
  trigger: 'push' | 'pull_request' | 'manual';
  target: 'preview' | 'production';
  branch: string;
  commit: string;
  commitMessage: string | null;
  author: string | null;
  pullRequest: number | null;
  status: BuildStatus;
  error: string | null;
  deploymentId: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface BuildDetail extends Build {
  log: string;
  logOffset: number;
}

export type DevicePoll =
  | { status: 'pending' | 'denied' | 'expired' }
  | { status: 'approved'; token: string; user: { id: string; name: string; email: string } };

export interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

const USER_AGENT = `codeqlick-cli/${VERSION}`;

/** The Cloud API (`/v1/cloud`), with the token when there is one. */
export type AnalyticsPeriod = '24h' | '7d' | '30d' | '90d' | '365d';
export interface AnalyticsRow {
  key: string;
  visitors: number;
  count: number;
}
export interface Analytics {
  enabled: boolean;
  snippet: string;
  period: AnalyticsPeriod;
  totals: { visitors: number; pageviews: number };
  series: Array<{ t: string; visitors: number; pageviews: number }>;
  pages: AnalyticsRow[];
  referrers: AnalyticsRow[];
  browsers: AnalyticsRow[];
  os: AnalyticsRow[];
  devices: AnalyticsRow[];
  events: AnalyticsRow[];
}

export interface KvItem {
  key: string;
  size: number;
  expiresAt: string | null;
  updatedAt: string;
}
export interface KvEntry extends KvItem {
  value: unknown;
}
export interface KvList {
  items: KvItem[];
  cursor: string | null;
  usage: { keys: number; bytes: number; maxKeys: number; maxBytes: number };
}

export class Api {
  private readonly base: string;
  private readonly token: string | undefined;

  constructor(base: string, token?: string) {
    this.base = base;
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let payload: FormData | string | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, { method, headers, body: payload });
    } catch (error) {
      throw new ApiError(0, `Can't reach ${this.base} (${(error as Error).message})`);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    let data: unknown = undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      // Not JSON.
    }
    if (!response.ok) {
      const problem = (data ?? {}) as {
        detail?: string;
        title?: string;
        errors?: Array<{ path: string; message: string }>;
      };
      const fields = problem.errors?.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new ApiError(
        response.status,
        problem.detail ?? fields ?? problem.title ?? `HTTP ${response.status}`,
      );
    }
    return data as T;
  }

  me = () => this.request<Me>('GET', '/cloud/me');
  projects = (team: string) =>
    this.request<{ items: Project[] }>(
      'GET',
      `/cloud/teams/${encodeURIComponent(team)}/projects`,
    ).then((r) => r.items);
  createProject = (team: string, name: string, slug: string) =>
    this.request<Project>('POST', `/cloud/teams/${encodeURIComponent(team)}/projects`, {
      name,
      slug,
    });
  deployments = (project: string, page = 1) =>
    this.request<{ items: Deployment[]; totalPages: number }>(
      'GET',
      `/cloud/projects/${project}/deployments?page=${page}&pageSize=50`,
    );
  promote = (project: string, deployment: string) =>
    this.request<Project>('POST', `/cloud/projects/${project}/deployments/${deployment}/promote`);
  files = (project: string, deployment: string) =>
    this.request<DeploymentFiles>(
      'GET',
      `/cloud/projects/${project}/deployments/${deployment}/files`,
    );
  compare = (project: string, deployment: string, other: string) =>
    this.request<DeploymentComparison>(
      'GET',
      `/cloud/projects/${project}/deployments/${deployment}/compare?with=${encodeURIComponent(other)}`,
    );
  domains = (project: string) =>
    this.request<{ items: Domain[] }>('GET', `/cloud/projects/${project}/domains`).then(
      (r) => r.items,
    );
  addDomain = (project: string, name: string) =>
    this.request<Domain>('POST', `/cloud/projects/${project}/domains`, { name });
  checkDomain = (project: string, id: string) =>
    this.request<Domain>('POST', `/cloud/projects/${project}/domains/${id}/check`);
  removeDomain = (project: string, id: string) =>
    this.request<void>('DELETE', `/cloud/projects/${project}/domains/${id}`);
  audit = (teamSlug: string, url: string, locale: string) =>
    this.request<AuditReport>('POST', '/cloud/audits', { teamSlug, url, locale });
  teamGithub = (team: string) =>
    this.request<TeamGithub>('GET', `/cloud/teams/${encodeURIComponent(team)}/github`);
  repos = (team: string, installationId: number) =>
    this.request<{ items: GithubRepo[] }>(
      'GET',
      `/cloud/teams/${encodeURIComponent(team)}/github/repos?installationId=${installationId}`,
    ).then((r) => r.items);
  git = (project: string) => this.request<GitSettings>('GET', `/cloud/projects/${project}/git`);
  setGit = (project: string, settings: GitSettingsInput) =>
    this.request<GitSettings>('PUT', `/cloud/projects/${project}/git`, settings);
  disconnectGit = (project: string) =>
    this.request<void>('DELETE', `/cloud/projects/${project}/git`);
  env = (project: string) =>
    this.request<{ items: EnvVar[] }>('GET', `/cloud/projects/${project}/env`).then((r) => r.items);
  setEnv = (
    project: string,
    variable: { key: string; value: string; production: boolean; preview: boolean },
  ) =>
    this.request<{ items: EnvVar[] }>('PUT', `/cloud/projects/${project}/env`, variable).then(
      (r) => r.items,
    );
  deleteEnv = (project: string, key: string) =>
    this.request<void>('DELETE', `/cloud/projects/${project}/env?key=${encodeURIComponent(key)}`);
  builds = (project: string, pageSize = 20) =>
    this.request<{ items: Build[] }>(
      'GET',
      `/cloud/projects/${project}/builds?page=1&pageSize=${pageSize}`,
    ).then((r) => r.items);
  build = (project: string, number: number, after = 0) =>
    this.request<BuildDetail>('GET', `/cloud/projects/${project}/builds/${number}?after=${after}`);
  startBuild = (project: string, branch?: string) =>
    this.request<Build>('POST', `/cloud/projects/${project}/builds`, branch ? { branch } : {});
  cancelBuild = (project: string, number: number) =>
    this.request<Build>('POST', `/cloud/projects/${project}/builds/${number}/cancel`);
  analytics = (project: string, period: AnalyticsPeriod) =>
    this.request<Analytics>('GET', `/cloud/projects/${project}/analytics?period=${period}`);
  kvList = (project: string, prefix?: string, cursor?: string) => {
    const query = new URLSearchParams({ limit: '100' });
    if (prefix) query.set('prefix', prefix);
    if (cursor) query.set('cursor', cursor);
    return this.request<KvList>('GET', `/cloud/projects/${project}/kv?${query.toString()}`);
  };
  kvGet = (project: string, key: string) =>
    this.request<KvEntry>('GET', `/cloud/projects/${project}/kv/${encodeURIComponent(key)}`);
  kvSet = (project: string, key: string, value: unknown, ttl?: number) =>
    this.request<KvEntry>('PUT', `/cloud/projects/${project}/kv/${encodeURIComponent(key)}`, {
      value,
      ttl,
    });
  kvDelete = (project: string, key: string) =>
    this.request<void>('DELETE', `/cloud/projects/${project}/kv/${encodeURIComponent(key)}`);
  kvIncr = (project: string, key: string, by: number) =>
    this.request<{ key: string; value: number }>(
      'POST',
      `/cloud/projects/${project}/kv/${encodeURIComponent(key)}/incr`,
      { by },
    );
  startDevice = (clientName: string, locale: string) =>
    this.request<DeviceStart>('POST', `/cloud/cli/device?locale=${locale}`, { clientName });
  pollDevice = (deviceCode: string) =>
    this.request<DevicePoll>('POST', '/cloud/cli/device/token', { deviceCode });

  async deploy(
    project: string,
    bundle: string,
    fields: {
      target: 'preview' | 'production';
      message?: string;
      commit?: string;
      branch?: string;
    },
  ): Promise<Deployment> {
    const form = new FormData();
    form.set('target', fields.target);
    if (fields.message) form.set('message', fields.message.slice(0, 200));
    if (fields.commit) form.set('commit', fields.commit);
    if (fields.branch) form.set('branch', fields.branch.slice(0, 100));
    form.set('bundle', await openAsBlob(bundle, { type: 'application/gzip' }), 'site.tar.gz');
    return this.request<Deployment>('POST', `/cloud/projects/${project}/deployments`, form);
  }
}
