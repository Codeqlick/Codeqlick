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
