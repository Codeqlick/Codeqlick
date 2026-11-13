import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import type { ProtectionPageError } from './cloud-protection-page.js';
import { CloudProtectionRepository, type ProtectedProject } from './cloud-protection.repository.js';
import {
  TICKET_TTL_SECONDS,
  TicketBook,
  TryLimiter,
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
import type { ProtectionInput } from './cloud.schemas.js';
import { CloudStorage } from './cloud.storage.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface ProtectionView {
  mode: ProtectionMode;
  days: number;
  hasPassword: boolean;
  updatedAt: string | null;
}

/** What the hosting site's Nginx sends on every call to /cloud/protection/*. */
export interface ProxyHeaders {
  key?: string;
  host?: string;
  slug?: string;
  kind?: string;
  access?: string;
}

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

const digest = (value: string) => createHash('sha256').update(value).digest();

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
  private readonly tries = new TryLimiter(5, 60_000);

  constructor(
    private readonly repository: CloudProtectionRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly storage: CloudStorage,
    private readonly config: AppConfigService,
  ) {
    this.cookieKey = protectionKey(config.credentialsSecret, 'cloud-protection-v1');
    this.ticketKey = protectionKey(config.credentialsSecret, 'cloud-protection-ticket-v1');
  }

  private view(project: {
    protection: ProtectionMode;
    protectionDays: number;
    protectionHash: string | null;
    protectionUpdatedAt: Date | null;
  }): ProtectionView {
    return {
      mode: project.protection,
      days: project.protectionDays,
      hasPassword: project.protectionHash !== null,
      updatedAt: project.protectionUpdatedAt?.toISOString() ?? null,
    };
  }

  // ── The project's setting (console and CLI) ────────────────────────────────────────────────

  async get(ctx: CloudCtx, projectId: string): Promise<ProtectionView> {
    const { project } = await this.projects.project(ctx, projectId);
    return this.view(project);
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
      return this.view(project);
    }
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
    return this.validAccess(project, headers.access, host, now);
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
    if (!this.tries.take(`${ip ?? 'unknown'}|${project.id}`, now)) {
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

  /** `GET /__codeqlick/enter?ticket=`: a member's single-use ticket sets the cookie. */
  async enter(
    headers: ProxyHeaders,
    ticket: string | undefined,
    now: number = Date.now(),
  ): Promise<VisitorAnswer> {
    this.assertKey(headers.key);
    const host = this.host(headers);
    const project = await this.protectedProject(headers);
    if (!project) return { type: 'redirect', location: '/' };
    const claim = verifyTicket(this.ticketKey, ticket, host, now);
    if (!claim || claim.projectId !== project.id || !this.tickets.redeem(claim.id, now)) {
      return { type: 'page', status: 401, projectName: project.name, next: '/', error: 'expired' };
    }
    return { type: 'redirect', location: '/', cookie: this.grant(project, host, now) };
  }
}
