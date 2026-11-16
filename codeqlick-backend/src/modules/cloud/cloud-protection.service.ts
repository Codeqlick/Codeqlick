import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import type { RedirectStatus } from './cloud-config.js';
import type { ProtectionPageError } from './cloud-protection-page.js';
import { CloudProtectionRepository, type ProtectedProject } from './cloud-protection.repository.js';
import {
  BYPASS_HEADER_MAX,
  BYPASS_TOUCH_MS,
  TICKET_TTL_SECONDS,
  TicketBook,
  TryLimiter,
  bypassMatches,
  generateBypassToken,
  protectionKey,
  protects,
  safeNext,
  signAccess,
  signTicket,
  verifyAccess,
  verifyTicket,
  type ProtectionKind,
  type ProtectionMode,
} from './cloud-protection.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudRulesService } from './cloud-rules.service.js';
import type { ProtectionInput } from './cloud.schemas.js';
import { CloudStorage } from './cloud.storage.js';
import { CloudTeamsService } from './cloud-teams.service.js';

/** The automation bypass token as people see it (never the token or its hash). */
export interface BypassView {
  prefix: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  lastUsedAt: string | null;
}

export interface ProtectionView {
  mode: ProtectionMode;
  days: number;
  hasPassword: boolean;
  updatedAt: string | null;
  bypass: BypassView | null;
}

/** A freshly made bypass token: the only time the token itself is returned. */
export interface BypassCreated {
  token: string;
  prefix: string;
  createdAt: string;
}

/** What the hosting site's Nginx sends on every call to /cloud/protection/*. */
export interface ProxyHeaders {
  key?: string;
  host?: string;
  slug?: string;
  kind?: string;
  access?: string;
  /** Only for rules (4.13 "Redirects, rewrites and headers"): the deployment and the request. */
  deployment?: string;
  uri?: string;
  args?: string;
  /** The visitor's `X-Codeqlick-Bypass` (decision 80), when sent. */
  bypass?: string;
}

/** What the edge check answers Nginx (`GET /cloud/edge/check`). */
export type EdgeAnswer =
  | { type: 'password' }
  | { type: 'redirect'; status: RedirectStatus; location: string }
  | { type: 'serve'; path: string; headers: Record<string, string> };

/** The password page to show (the controller adds the visitor's language). */
export interface PageAnswer {
  type: 'page';
  status: number;
  projectName: string | null;
  next: string;
  error?: ProtectionPageError;
}

/** A redirect, setting the access cookie when there is one. */
export interface RedirectAnswer {
  type: 'redirect';
  location: string;
  cookie?: { value: string; days: number };
}

export type VisitorAnswer = PageAnswer | RedirectAnswer;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const digest = (value: string) => createHash('sha256').update(value).digest();

/** The mode that protects every address either of two modes protects. */
function widest(a: ProtectionMode, b: ProtectionMode): ProtectionMode {
  if (a === 'ALL' || b === 'ALL') return 'ALL';
  return a === 'PREVIEWS' || b === 'PREVIEWS' ? 'PREVIEWS' : 'OFF';
}

/**
 * Password-protected addresses (architecture 4.13 "Password protection", decision 50): the
 * project's setting, the checks Nginx asks for, the visitor's password page and the members'
 * single-use tickets.
 */
@Injectable()
export class CloudProtectionService {
  private readonly cookieKey: Buffer;
  private readonly ticketKey: Buffer;
  private readonly tickets = new TicketBook();
  private readonly tries = new TryLimiter(5, 60, 60_000);
  /** When each project's bypass last use was written, so a busy run is one write a minute. */
  private readonly touched = new Map<string, number>();

  constructor(
    private readonly repository: CloudProtectionRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly storage: CloudStorage,
    private readonly config: AppConfigService,
    private readonly rules: CloudRulesService,
  ) {
    this.cookieKey = protectionKey(config.credentialsSecret, 'cloud-protection-v1');
    this.ticketKey = protectionKey(config.credentialsSecret, 'cloud-protection-ticket-v1');
  }

  private view(project: ProtectedProject): ProtectionView {
    return {
      mode: project.protection,
      days: project.protectionDays,
      hasPassword: project.protectionHash !== null,
      updatedAt: project.protectionUpdatedAt?.toISOString() ?? null,
      bypass:
        project.protectionBypassHash && project.protectionBypassPrefix
          ? {
              prefix: project.protectionBypassPrefix,
              createdAt: (project.protectionBypassCreatedAt ?? new Date(0)).toISOString(),
              createdBy: project.protectionBypassCreatedBy,
              lastUsedAt: project.protectionBypassLastUsedAt?.toISOString() ?? null,
            }
          : null,
    };
  }

  // ── The project's setting (console and CLI) ────────────────────────────────────────────────

  async get(ctx: CloudCtx, projectId: string): Promise<ProtectionView> {
    await this.projects.project(ctx, projectId);
    const project = await this.repository.findById(projectId);
    if (!project) throw new NotFoundException('Project not found');
    return this.view(project);
  }

  /** Creates or replaces the bypass token (ADMIN); the token is returned only here. */
  async createBypass(ctx: CloudCtx, projectId: string): Promise<BypassCreated> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    if (project.suspendedAt) throw new ForbiddenException('This project is suspended');
    if (!this.config.cloudProtectionKey) {
      throw new ServiceUnavailableException('Password protection is not set up yet');
    }
    const { token, hash, prefix } = generateBypassToken();
    const createdAt = new Date();
    const replaced = project.protectionBypassHash !== null;
    await this.repository.setBypass(project.id, {
      hash,
      prefix,
      createdAt,
      createdById: ctx.user.id,
    });
    this.touched.delete(project.id);
    await this.teams.record(
      ctx,
      project.teamId,
      'project.protection_bypass_created',
      project.slug,
      {
        replaced,
      },
    );
    return { token, prefix, createdAt: createdAt.toISOString() };
  }

  /** Revokes the bypass token (ADMIN); allowed on a suspended project, a no-op without one. */
  async revokeBypass(ctx: CloudCtx, projectId: string): Promise<void> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    if (project.protectionBypassHash === null) return;
    await this.repository.clearBypass(project.id);
    this.touched.delete(project.id);
    await this.teams.record(ctx, project.teamId, 'project.protection_bypass_revoked', project.slug);
  }

  async update(ctx: CloudCtx, projectId: string, input: ProtectionInput): Promise<ProtectionView> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    const on = input.mode !== 'OFF';
    if (on && !this.config.cloudProtectionKey) {
      throw new ServiceUnavailableException('Password protection is not set up yet');
    }
    if (on && !input.password && !project.protectionHash) {
      throw new BadRequestException('Turning password protection on needs a password');
    }
    const passwordChanged = on && input.password !== undefined;
    const modeChanged = input.mode !== project.protection;
    const days = input.days ?? project.protectionDays;
    const protectionHash = !on
      ? null
      : passwordChanged
        ? await argon2.hash(input.password!, { type: argon2.argon2id })
        : project.protectionHash;
    if (!modeChanged && !passwordChanged && days === project.protectionDays) {
      await this.storage.writeProtection(project.slug, project.protection);
      return this.get(ctx, projectId);
    }
    // Never a window open to everyone: markers a new mode adds are written before the change is
    // saved, and the ones it drops are removed only once it is saved.
    await this.storage.writeProtection(project.slug, widest(project.protection, input.mode));
    const updated = await this.repository.update(project.id, {
      protection: input.mode,
      protectionHash,
      protectionDays: days,
      // A new version ends every access given before (the days alone don't).
      protectionVersion: project.protectionVersion + (modeChanged || passwordChanged ? 1 : 0),
      protectionUpdatedAt: new Date(),
    });
    await this.storage.writeProtection(project.slug, input.mode);
    await this.teams.record(ctx, project.teamId, 'project.protection_changed', project.slug, {
      mode: input.mode,
      days,
      passwordChanged,
    });
    return this.view(updated);
  }

  /**
   * Where a member's console link goes: through a single-use ticket when the address is
   * protected, the plain address otherwise. 400 when it isn't one of the project's addresses.
   */
  async ticket(
    ctx: CloudCtx,
    projectId: string,
    host: string,
    now: number = Date.now(),
  ): Promise<{ url: string; expiresIn: number }> {
    const { project } = await this.projects.project(ctx, projectId);
    const kind = await this.addressKind(project, host);
    if (!kind) throw new BadRequestException("That isn't one of the project's addresses");
    if (!protects(project.protection, kind)) {
      return { url: `https://${host}/`, expiresIn: TICKET_TTL_SECONDS };
    }
    const expiresAt = Math.floor(now / 1000) + TICKET_TTL_SECONDS;
    const id = this.tickets.issue(expiresAt, now);
    const ticket = signTicket(this.ticketKey, { projectId: project.id, id, expiresAt }, host);
    return {
      url: `https://${host}/__codeqlick/enter?ticket=${encodeURIComponent(ticket)}`,
      expiresIn: TICKET_TTL_SECONDS,
    };
  }

  /** `production` or `previews` for one of the project's addresses; null for any other. */
  private async addressKind(
    project: { id: string; slug: string; domains: Array<{ name: string }> },
    host: string,
  ): Promise<ProtectionKind | null> {
    const production = new URL(this.projects.projectUrl(project.slug)).hostname;
    if (host === production) return 'production';
    if (project.domains.some((domain) => domain.name === host)) return 'production';
    const domain = production.slice(project.slug.length + 1);
    const prefix = `${project.slug}--`;
    if (host.startsWith(prefix) && host.endsWith(`.${domain}`)) {
      const shortId = host.slice(prefix.length, -(domain.length + 1));
      if (
        /^[0-9a-f]{8}$/.test(shortId) &&
        (await this.repository.hasDeployment(project.id, shortId))
      ) {
        return 'previews';
      }
      // A branch address (`<slug>--b-<branch>`, 4.13 "Branch addresses"): always a preview.
      if (/^b-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shortId)) return 'previews';
    }
    return null;
  }

  // ── What Nginx asks (the hosting sites) ────────────────────────────────────────────────────

  /** 503 while it isn't set up; 403 without the right key (protection fails closed). */
  private assertKey(given: string | undefined): void {
    const key = this.config.cloudProtectionKey;
    if (!key) throw new ServiceUnavailableException('Password protection is not set up yet');
    if (!given || !timingSafeEqual(digest(given), digest(key))) {
      throw new ForbiddenException('Not allowed');
    }
  }

  private host(headers: ProxyHeaders): string {
    const host = headers.host?.trim().toLowerCase();
    if (!host || host.length > 253) throw new BadRequestException('Missing X-Cq-Host');
    return host;
  }

  private kind(headers: ProxyHeaders): ProtectionKind {
    // Anything but `production` is checked as a preview, the stricter of the two.
    return headers.kind === 'production' ? 'production' : 'previews';
  }

  private async protectedProject(headers: ProxyHeaders): Promise<ProtectedProject | null> {
    const slug = headers.slug?.trim().toLowerCase();
    if (!slug || slug.length > 40) return null;
    const project = await this.repository.findBySlug(slug);
    if (!project || project.suspendedAt) return null;
    if (!project.protectionHash || !protects(project.protection, this.kind(headers))) return null;
    return project;
  }

  /** True lets the request through (`204`), false asks for the password (`401`). */
  async check(headers: ProxyHeaders, now: number = Date.now()): Promise<boolean> {
    this.assertKey(headers.key);
    const host = this.host(headers);
    const project = await this.protectedProject(headers);
    // Not protected for that kind (a marker not yet removed), suspended or unknown: through.
    if (!project) return true;
    if (this.validAccess(project, headers.access, host, now)) return true;
    return this.validBypass(project, headers, now);
  }

  /**
   * The bypass token for automation (decision 80), tried only when the cookie didn't pass. It is
   * always compared (a SHA-256 and a constant-time compare, cheap). A wrong token counts as no
   * token; there is no per-IP limit on wrong ones (a 256-bit token can't be guessed).
   */
  private async validBypass(
    project: ProtectedProject,
    headers: ProxyHeaders,
    now: number,
  ): Promise<boolean> {
    const token = headers.bypass;
    if (!token || token.length > BYPASS_HEADER_MAX) return false;
    if (!bypassMatches(project.protectionBypassHash, token)) return false;
    await this.touchBypass(project, now);
    return true;
  }

  /** Writes the last use at most once a minute per project (also across concurrent calls). */
  private async touchBypass(project: ProtectedProject, now: number): Promise<void> {
    const last = Math.max(
      project.protectionBypassLastUsedAt?.getTime() ?? 0,
      this.touched.get(project.id) ?? 0,
    );
    if (now - last < BYPASS_TOUCH_MS) return;
    this.touched.set(project.id, now);
    await this.repository
      .touchBypass(project.id, project.protectionBypassHash!, new Date(now))
      .catch(() => undefined);
  }

  /**
   * The one check Nginx makes per request that needs it: the password first, then the
   * deployment's rules (a redirect, or the file to serve and the headers to add). A deployment
   * without rules answers an empty path: today's behaviour.
   */
  async edge(headers: ProxyHeaders, now: number = Date.now()): Promise<EdgeAnswer> {
    if (!(await this.check(headers, now))) return { type: 'password' };
    const deployment = headers.deployment?.trim().toLowerCase();
    if (!deployment || !UUID.test(deployment) || headers.uri === undefined) {
      return { type: 'serve', path: '', headers: {} };
    }
    const result = await this.rules.evaluate(deployment, headers.uri, headers.args ?? '');
    if (!result) return { type: 'serve', path: '', headers: {} };
    return result.kind === 'redirect'
      ? { type: 'redirect', status: result.status, location: result.location }
      : { type: 'serve', path: result.path, headers: result.headers };
  }

  private validAccess(
    project: ProtectedProject,
    value: string | undefined,
    host: string,
    now: number,
  ): boolean {
    const grant = verifyAccess(this.cookieKey, value, host, now);
    return (
      grant !== null &&
      grant.projectId === project.id &&
      grant.version === project.protectionVersion
    );
  }

  private grant(project: ProtectedProject, host: string, now: number) {
    const expiresAt = Math.floor(now / 1000) + project.protectionDays * 86_400;
    return {
      value: signAccess(
        this.cookieKey,
        { projectId: project.id, version: project.protectionVersion, expiresAt },
        host,
      ),
      days: project.protectionDays,
    };
  }

  /** `GET /__codeqlick/password?next=`: the page, or straight on when nothing asks for it. */
  async page(
    headers: ProxyHeaders,
    next: string,
    now: number = Date.now(),
  ): Promise<VisitorAnswer> {
    this.assertKey(headers.key);
    const host = this.host(headers);
    const project = await this.protectedProject(headers);
    if (!project || this.validAccess(project, headers.access, host, now)) {
      return { type: 'redirect', location: next };
    }
    return { type: 'page', status: 200, projectName: project.name, next };
  }

  /** `POST /__codeqlick/password`: right, the cookie and on to `next`; wrong, the page again. */
  async submit(
    headers: ProxyHeaders,
    ip: string | null,
    form: { password?: unknown; next?: unknown },
    now: number = Date.now(),
  ): Promise<VisitorAnswer> {
    this.assertKey(headers.key);
    const host = this.host(headers);
    const next = safeNext(form.next);
    const project = await this.protectedProject(headers);
    if (!project) return { type: 'redirect', location: next };
    if (!this.tries.take(ip, project.id, now)) {
      return { type: 'page', status: 429, projectName: project.name, next, error: 'wait' };
    }
    const password = typeof form.password === 'string' ? form.password : '';
    const right =
      password.length > 0 &&
      password.length <= 128 &&
      (await argon2.verify(project.protectionHash!, password).catch(() => false));
    if (!right) {
      return { type: 'page', status: 401, projectName: project.name, next, error: 'wrong' };
    }
    return { type: 'redirect', location: next, cookie: this.grant(project, host, now) };
  }

  /** `GET /__codeqlick/enter?ticket=&next=`: a member's single-use ticket sets the cookie. */
  async enter(
    headers: ProxyHeaders,
    ticket: string | undefined,
    now: number = Date.now(),
    next: string = '/',
  ): Promise<VisitorAnswer> {
    this.assertKey(headers.key);
    const host = this.host(headers);
    const project = await this.protectedProject(headers);
    if (!project) return { type: 'redirect', location: next };
    const claim = verifyTicket(this.ticketKey, ticket, host, now);
    if (!claim || claim.projectId !== project.id || !this.tickets.redeem(claim.id, now)) {
      return { type: 'page', status: 401, projectName: project.name, next: '/', error: 'expired' };
    }
    return { type: 'redirect', location: next, cookie: this.grant(project, host, now) };
  }
}
