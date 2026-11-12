import { createSign } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';

const API = 'https://api.github.com';
const USER_AGENT = 'Codeqlick-Cloud';

export class GithubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GithubRepo {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface GithubCommit {
  sha: string;
  message: string;
  author: string | null;
}

/**
 * GitHub's REST API as Cloud's GitHub App (architecture 4.13, decision 40): the app's JWT, short
 * installation tokens, OAuth for checking an installer, statuses and comments. No SDK; replaced in tests.
 */
@Injectable()
export class GithubClient {
  private readonly logger = new Logger(GithubClient.name);

  constructor(private readonly config: AppConfigService) {}

  get configured(): boolean {
    return this.config.githubApp !== undefined;
  }

  private app() {
    const app = this.config.githubApp;
    if (!app) throw new ServiceUnavailableException('Builds from Git are not set up yet');
    return app;
  }

  /** The app's own JWT (RS256, 9 minutes), for the /app endpoints. */
  appJwt(now = Date.now()): string {
    const app = this.app();
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const iat = Math.floor(now / 1000) - 30;
    const body = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat, exp: iat + 540, iss: app.appId })}`;
    const signature = createSign('RSA-SHA256')
      .update(body)
      .sign(app.privateKey)
      .toString('base64url');
    return `${body}.${signature}`;
  }

  private async call<T>(
    method: string,
    path: string,
    auth: string,
    body?: unknown,
    base = API,
  ): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': USER_AGENT,
        ...(auth ? { Authorization: auth } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) {
      this.logger.warn(`GitHub ${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
      throw new GithubError(response.status, `GitHub answered ${response.status}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** A one-hour token of an installation, limited to one repository when given. */
  async installationToken(
    installationId: bigint | number,
    repoId?: bigint | number,
  ): Promise<string> {
    const result = await this.call<{ token: string }>(
      'POST',
      `/app/installations/${installationId}/access_tokens`,
      `Bearer ${this.appJwt()}`,
      repoId ? { repository_ids: [Number(repoId)] } : {},
    );
    return result.token;
  }

  async installation(
    installationId: bigint | number,
  ): Promise<{ login: string; type: string; suspended: boolean }> {
    const result = await this.call<{
      account: { login: string; type: string };
      suspended_at: string | null;
    }>('GET', `/app/installations/${installationId}`, `Bearer ${this.appJwt()}`);
    return {
      login: result.account.login,
      type: result.account.type,
      suspended: !!result.suspended_at,
    };
  }

  /** Exchanges the OAuth code GitHub sends after installing for the person's token. */
  async userToken(code: string): Promise<string> {
    const app = this.app();
    const result = await this.call<{ access_token?: string; error?: string }>(
      'POST',
      '/login/oauth/access_token',
      '',
      { client_id: app.clientId, client_secret: app.clientSecret, code },
      'https://github.com',
    );
    if (!result.access_token) throw new GithubError(401, result.error ?? 'No token');
    return result.access_token;
  }

  /** The installations of the app the person can see (decision 40). */
  async userInstallationIds(userToken: string): Promise<number[]> {
    const result = await this.call<{ installations: Array<{ id: number }> }>(
      'GET',
      '/user/installations?per_page=100',
      `Bearer ${userToken}`,
    );
    return result.installations.map((installation) => installation.id);
  }

  async repositories(installationId: bigint | number): Promise<GithubRepo[]> {
    const token = await this.installationToken(installationId);
    const result = await this.call<{
      repositories: Array<{
        id: number;
        full_name: string;
        default_branch: string;
        private: boolean;
      }>;
    }>('GET', '/installation/repositories?per_page=100', `token ${token}`);
    return result.repositories.map((repo) => ({
      id: repo.id,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      private: repo.private,
    }));
  }

  async branchHead(
    installationId: bigint | number,
    repoId: bigint | number,
    fullName: string,
    branch: string,
  ): Promise<GithubCommit> {
    const token = await this.installationToken(installationId, repoId);
    const result = await this.call<{
      commit: { sha: string; commit: { message: string; author: { name: string } | null } };
    }>('GET', `/repos/${fullName}/branches/${encodeURIComponent(branch)}`, `token ${token}`);
    return {
      sha: result.commit.sha,
      message: result.commit.commit.message,
      author: result.commit.commit.author?.name ?? null,
    };
  }

  async setStatus(
    installationId: bigint | number,
    repoId: bigint | number,
    fullName: string,
    sha: string,
    state: 'pending' | 'success' | 'failure' | 'error',
    description: string,
    targetUrl: string,
  ): Promise<void> {
    const token = await this.installationToken(installationId, repoId);
    await this.call('POST', `/repos/${fullName}/statuses/${sha}`, `token ${token}`, {
      state,
      description: description.slice(0, 140),
      target_url: targetUrl,
      context: 'Codeqlick Cloud',
    });
  }

  /** Creates the pull request's comment, or updates it; returns its id. */
  async upsertComment(
    installationId: bigint | number,
    repoId: bigint | number,
    fullName: string,
    pullRequest: number,
    commentId: bigint | null,
    body: string,
  ): Promise<bigint> {
    const token = await this.installationToken(installationId, repoId);
    if (commentId) {
      await this.call(
        'PATCH',
        `/repos/${fullName}/issues/comments/${commentId}`,
        `token ${token}`,
        { body },
      );
      return commentId;
    }
    const created = await this.call<{ id: number }>(
      'POST',
      `/repos/${fullName}/issues/${pullRequest}/comments`,
      `token ${token}`,
      { body },
    );
    return BigInt(created.id);
  }
}
