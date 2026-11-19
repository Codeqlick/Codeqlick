import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { Menu, Prisma } from '../../generated/prisma/client.js';
import { RateWindow } from '../cloud/cloud-deploy-hooks.js';
import { MailService } from '../mail/mail.service.js';
import {
  defaultContent,
  parseContent,
  publicContent,
  readContent,
  withItemFlags,
  withoutAllergens,
  type ContentIssue,
  type MenuContent,
} from './menu-content.js';
import {
  DEFAULT_CURRENCY,
  SLUG_CHANGES_MAX,
  SLUG_CHANGES_WINDOW_DAYS,
  SLUG_REDIRECT_DAYS,
  menuLimits,
  type MenuPlanLimits,
} from './menu-limits.js';
import { menuQrSvg } from './menu-qr.js';
import { slugProblem, type SlugProblem } from './menu-slug.js';
import { textProblem } from './menu-text.js';
import { menuReportEmail } from './menus-emails.js';
import { MenusRepository } from './menus.repository.js';
import type {
  CreateMenuInput,
  ItemFlagsInput,
  PutContentInput,
  ReportInput,
  UpdateMenuInput,
} from './menus.schemas.js';

/** A row of the owner's list: no content. */
export interface MenuSummary {
  id: string;
  slug: string;
  kind: 'MENU' | 'CATALOGUE';
  businessName: string;
  enabled: boolean;
  suspended: boolean;
  updatedAt: string;
}

/** The owner's whole menu. */
export interface MenuView {
  id: string;
  slug: string;
  /** The short link the QR and the poster carry. */
  url: string;
  kind: 'MENU' | 'CATALOGUE';
  businessName: string;
  language: 'EN' | 'ES';
  currency: string;
  title: string;
  intro: string;
  address: string;
  openingNote: string;
  note: string;
  enabled: boolean;
  indexable: boolean;
  suspended: boolean;
  suspendedReason: string | null;
  revision: number;
  content: MenuContent;
  /** The old slugs still redirecting here. */
  redirects: Array<{ slug: string; expiresAt: string }>;
  createdAt: string;
  updatedAt: string;
}

/** What anyone with the link sees. */
export interface PublicMenu {
  slug: string;
  kind: 'MENU' | 'CATALOGUE';
  businessName: string;
  language: 'EN' | 'ES';
  currency: string;
  title: string;
  intro: string;
  address: string;
  openingNote: string;
  note: string;
  content: MenuContent;
  indexable: boolean;
  /** "Made with Codeqlick" (free menus). */
  showBadge: boolean;
}

export type PublicLookup =
  { found: 'menu'; menu: PublicMenu } | { found: 'redirect'; slug: string };

export interface SitemapEntry {
  slug: string;
  language: 'EN' | 'ES';
  updatedAt: string;
}

const DAY_MS = 86_400_000;
/** Reports per IP per day (the per-minute limit is the controller's). */
const REPORTS_PER_DAY = 10;
/** The sitemap protocol's cap. */
const SITEMAP_MAX = 50_000;
/** Tries to apply a quick change when another save lands in between. */
const QUICK_CHANGE_TRIES = 4;

function unprocessable(errors: ContentIssue[]): UnprocessableEntityException {
  return new UnprocessableEntityException({ detail: 'Validation failed', errors });
}

const SLUG_MESSAGES: Record<SlugProblem, string> = {
  invalid: 'Use 3 to 40 lowercase letters, digits and single dashes',
  reserved: 'That link is reserved',
};

/** The default title of a menu: "Menu"/"Carta" or "Catalogue"/"Catálogo". */
export function defaultTitle(kind: 'MENU' | 'CATALOGUE', language: 'EN' | 'ES'): string {
  const titles = {
    MENU: { EN: 'Menu', ES: 'Carta' },
    CATALOGUE: { EN: 'Catalogue', ES: 'Catálogo' },
  };
  return titles[kind][language];
}

/** Menu (architecture 4.20): QR menus and catalogues at menu.codeqlick.com. */
@Injectable()
export class MenusService {
  private readonly logger = new Logger(MenusService.name);
  private readonly reportsPerIp = new RateWindow(REPORTS_PER_DAY, DAY_MS);

  constructor(
    private readonly repository: MenusRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  // ---- The owner's menus ----------------------------------------------------------------------

  async list(user: AuthUser): Promise<{ items: MenuSummary[]; limits: MenuPlanLimits }> {
    const rows = await this.repository.listByOwner(user.id);
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        kind: row.kind,
        businessName: row.businessName,
        enabled: row.enabled,
        suspended: row.suspendedAt !== null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      limits: menuLimits(user),
    };
  }

  async get(user: AuthUser, id: string, now = new Date()): Promise<MenuView> {
    return this.view(await this.own(user, id), now);
  }

  async create(user: AuthUser, input: CreateMenuInput, now = new Date()): Promise<MenuView> {
    const limits = menuLimits(user);
    const problem = slugProblem(input.slug, { admin: user.role === 'ADMIN' });
    const errors: ContentIssue[] = [];
    if (problem) errors.push({ path: 'slug', message: SLUG_MESSAGES[problem] });
    errors.push(...this.textIssues(input));
    const parsed =
      input.content === undefined
        ? { ok: true as const, content: defaultContent(input.kind, input.language) }
        : parseContent(input.content, { kind: input.kind, limits });
    if (!parsed.ok) errors.push(...parsed.errors);
    if (errors.length > 0) throw unprocessable(errors);
    if (!parsed.ok) throw unprocessable([]);

    if (await this.slugTaken(input.slug, user.id, undefined, now)) {
      throw new ConflictException('That link is taken');
    }
    let created: Menu | null;
    try {
      created = await this.repository.createWithinLimit(
        user.id,
        limits.menus,
        {
          ownerId: user.id,
          slug: input.slug,
          kind: input.kind,
          businessName: input.businessName,
          language: input.language,
          currency: input.currency ?? DEFAULT_CURRENCY,
          title: input.title ?? defaultTitle(input.kind, input.language),
          intro: input.intro ?? '',
          address: input.address ?? '',
          openingNote: input.openingNote ?? '',
          note: input.note ?? '',
          enabled: input.enabled ?? true,
          indexable: input.indexable ?? true,
          content: parsed.content as unknown as Prisma.InputJsonValue,
        },
        now,
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('That link is taken');
      throw error;
    }
    if (!created) {
      throw new ConflictException({
        message: `At most ${limits.menus} menu${limits.menus === 1 ? '' : 's'} per account`,
        code: 'MENU_LIMIT',
      });
    }
    return this.view(created, now);
  }

  async update(
    user: AuthUser,
    id: string,
    input: UpdateMenuInput,
    now = new Date(),
  ): Promise<MenuView> {
    const menu = await this.own(user, id);
    if (input.revision !== menu.revision) throw staleRevision();
    const suspended = menu.suspendedAt !== null;
    if (suspended && input.enabled === true && !menu.enabled) {
      throw new ForbiddenException('This menu is suspended: it cannot be turned on');
    }
    const errors = this.textIssues(input);
    const { revision, slug, content: contentInput, ...fields } = input;
    const move: { claim?: string; leave?: { slug: string; expiresAt: Date } } = {};
    if (slug !== undefined && slug !== menu.slug) {
      if (suspended) throw new ForbiddenException('This menu is suspended: its link cannot change');
      const problem = slugProblem(slug, { admin: user.role === 'ADMIN' });
      if (problem) errors.push({ path: 'slug', message: SLUG_MESSAGES[problem] });
    }
    // Settings and content are validated together: nothing is written unless both are fine.
    let content: MenuContent | undefined;
    if (contentInput !== undefined) {
      const parsed = parseContent(contentInput, {
        kind: input.kind ?? menu.kind,
        limits: menuLimits(user),
      });
      if (parsed.ok) content = parsed.content;
      else errors.push(...parsed.errors);
    }
    if (errors.length > 0) throw unprocessable(errors);

    const data: Prisma.MenuUncheckedUpdateManyInput = { ...fields };
    if (content) data.content = content as unknown as Prisma.InputJsonValue;
    if (slug !== undefined && slug !== menu.slug) {
      if (await this.slugTaken(slug, user.id, menu.id, now)) {
        throw new ConflictException('That link is taken');
      }
      // The changes of the last 30 days, from the menu's own record (not from the redirects).
      const since = now.getTime() - SLUG_CHANGES_WINDOW_DAYS * DAY_MS;
      const recent = menu.slugChangedAt.filter((at) => at.getTime() >= since);
      if (recent.length >= SLUG_CHANGES_MAX) {
        throw new ConflictException({
          message: `A link can change ${SLUG_CHANGES_MAX} times in ${SLUG_CHANGES_WINDOW_DAYS} days`,
          code: 'SLUG_CHANGE_LIMIT',
        });
      }
      data.slug = slug;
      data.slugChangedAt = { set: [...recent, now] };
      move.claim = slug;
      move.leave = {
        slug: menu.slug,
        expiresAt: new Date(now.getTime() + SLUG_REDIRECT_DAYS * DAY_MS),
      };
    }
    if (content === undefined && input.kind === 'CATALOGUE' && menu.kind === 'MENU') {
      // A catalogue has no allergens.
      data.content = withoutAllergens(
        readContent(menu.content),
      ) as unknown as Prisma.InputJsonValue;
    }

    let updated: Menu | null;
    try {
      updated = await this.repository.update(menu.id, revision, data, move, now);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('That link is taken');
      throw error;
    }
    if (!updated) throw staleRevision();
    return this.view(updated, now);
  }

  async putContent(
    user: AuthUser,
    id: string,
    input: PutContentInput,
    now = new Date(),
  ): Promise<MenuView> {
    const menu = await this.own(user, id);
    if (input.revision !== menu.revision) throw staleRevision();
    const parsed = parseContent(input.content, { kind: menu.kind, limits: menuLimits(user) });
    if (!parsed.ok) throw unprocessable(parsed.errors);
    const updated = await this.repository.update(
      menu.id,
      input.revision,
      { content: parsed.content as unknown as Prisma.InputJsonValue },
      {},
      now,
    );
    if (!updated) throw staleRevision();
    return this.view(updated, now);
  }

  /** The availability page's quick change: applied to the stored content, no revision needed. */
  async setItemFlags(
    user: AuthUser,
    id: string,
    key: string,
    flags: ItemFlagsInput,
    now = new Date(),
  ): Promise<{ revision: number }> {
    for (let attempt = 0; attempt < QUICK_CHANGE_TRIES; attempt += 1) {
      const menu = await this.own(user, id);
      const content = withItemFlags(readContent(menu.content), key, flags);
      if (!content) throw new NotFoundException('Item not found');
      const updated = await this.repository.update(
        menu.id,
        menu.revision,
        { content: content as unknown as Prisma.InputJsonValue },
        {},
        now,
      );
      if (updated) return { revision: updated.revision };
    }
    throw new ConflictException('The menu is being edited; try again');
  }

  async slugCheck(
    user: AuthUser,
    slug: string,
    menuId: string | undefined,
    now = new Date(),
  ): Promise<{ available: boolean; reason?: 'taken' | 'reserved' | 'invalid' }> {
    const wanted = slug.trim().toLowerCase();
    const problem = slugProblem(wanted, { admin: user.role === 'ADMIN' });
    if (problem) return { available: false, reason: problem };
    const own = menuId ? await this.repository.findById(menuId) : null;
    const except = own && own.ownerId === user.id ? own.id : undefined;
    if (await this.slugTaken(wanted, user.id, except, now)) {
      return { available: false, reason: 'taken' };
    }
    return { available: true };
  }

  async qr(user: AuthUser, id: string): Promise<string> {
    const menu = await this.own(user, id);
    const es = menu.language === 'ES';
    return menuQrSvg(
      this.link(menu.slug),
      es ? `Código QR de ${menu.businessName}` : `QR code of ${menu.businessName}`,
    );
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.own(user, id);
    await this.repository.delete(id);
  }

  // ---- Public -----------------------------------------------------------------------------------

  /**
   * The menu behind a link: the menu, a redirect to the new link of one renamed, or 404. A missing,
   * paused or suspended menu answers the same, so a page doesn't reveal why.
   */
  async publicLookup(slug: string, now = new Date()): Promise<PublicLookup> {
    const menu = await this.repository.findBySlug(slug);
    if (menu) {
      if (!isLive(menu)) throw notAvailable();
      return { found: 'menu', menu: this.publicView(menu) };
    }
    const redirect = await this.repository.findRedirect(slug);
    if (redirect && redirect.expiresAt > now) {
      const target = await this.repository.findById(redirect.menuId);
      if (target && isLive(target)) return { found: 'redirect', slug: target.slug };
    }
    throw notAvailable();
  }

  async sitemap(): Promise<{ items: SitemapEntry[] }> {
    const rows = await this.repository.sitemap(SITEMAP_MAX);
    return {
      items: rows.map((row) => ({
        slug: row.slug,
        language: row.language,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  /** A visitor reports a menu: stored, and the team inbox is emailed. */
  async report(input: ReportInput, ip: string): Promise<void> {
    if (input.website && input.website.trim() !== '') {
      this.logger.warn('Menu report honeypot triggered; report discarded');
      return;
    }
    if (!this.reportsPerIp.take(ip)) {
      throw new HttpException('Too many reports today', HttpStatus.TOO_MANY_REQUESTS);
    }
    const menu = await this.repository.findBySlug(input.slug);
    if (!menu) throw new NotFoundException('Menu not found');
    const email = input.email ? input.email.trim().toLowerCase() : null;
    await this.repository.createReport({
      menuId: menu.id,
      slug: menu.slug,
      businessName: menu.businessName,
      reason: input.reason,
      details: input.details,
      email,
    });
    try {
      await this.mail.send(
        menuReportEmail({
          to: this.config.leadsNotifyTo,
          slug: menu.slug,
          businessName: menu.businessName,
          reason: input.reason,
          details: input.details,
          email,
          adminUrl: `${this.config.siteUrl}/es/admin/menus`,
          siteUrl: this.config.siteUrl,
        }),
      );
    } catch (error) {
      this.logger.error(`Menu report email failed: ${String(error)}`);
    }
  }

  // ---- Helpers ----------------------------------------------------------------------------------

  /** The public link, `menu.codeqlick.com/<slug>`. */
  link(slug: string): string {
    return `${this.config.webappUrl('menu')}/${slug}`;
  }

  /**
   * Whether a slug is used by another menu, or reserved by another owner's redirect still working.
   * `except` is the menu being edited; the owner's own old slugs and expired redirects are free.
   */
  private async slugTaken(
    slug: string,
    ownerId: string,
    except: string | undefined,
    now: Date,
  ): Promise<boolean> {
    const menu = await this.repository.findBySlug(slug);
    if (menu && menu.id !== except) return true;
    const redirect = await this.repository.findRedirect(slug);
    return !!redirect && redirect.expiresAt > now && redirect.menu.ownerId !== ownerId;
  }

  /** Plain-text rules of the top-level texts: 422 with the field's name. */
  private textIssues(input: Partial<Record<string, unknown>>): ContentIssue[] {
    const issues: ContentIssue[] = [];
    for (const field of ['businessName', 'title', 'intro', 'address', 'openingNote', 'note']) {
      const value = input[field];
      if (typeof value !== 'string') continue;
      const problem = textProblem(value);
      if (problem) issues.push({ path: field, message: problem });
    }
    return issues;
  }

  private async own(user: AuthUser, id: string): Promise<Menu> {
    const menu = await this.repository.findById(id);
    if (!menu || menu.ownerId !== user.id) throw new NotFoundException('Menu not found');
    return menu;
  }

  private async view(menu: Menu, now: Date): Promise<MenuView> {
    const redirects = await this.repository.activeRedirects(menu.id, now);
    return {
      id: menu.id,
      slug: menu.slug,
      url: this.link(menu.slug),
      kind: menu.kind,
      businessName: menu.businessName,
      language: menu.language,
      currency: menu.currency,
      title: menu.title,
      intro: menu.intro,
      address: menu.address,
      openingNote: menu.openingNote,
      note: menu.note,
      enabled: menu.enabled,
      indexable: menu.indexable,
      suspended: menu.suspendedAt !== null,
      suspendedReason: menu.suspendedAt ? menu.suspendedReason : null,
      revision: menu.revision,
      content: readContent(menu.content),
      redirects: redirects.map((row) => ({
        slug: row.slug,
        expiresAt: row.expiresAt.toISOString(),
      })),
      createdAt: menu.createdAt.toISOString(),
      updatedAt: menu.updatedAt.toISOString(),
    };
  }

  private publicView(menu: Menu): PublicMenu {
    return {
      slug: menu.slug,
      kind: menu.kind,
      businessName: menu.businessName,
      language: menu.language,
      currency: menu.currency,
      title: menu.title,
      intro: menu.intro,
      address: menu.address,
      openingNote: menu.openingNote,
      note: menu.note,
      content: publicContent(readContent(menu.content), menu.kind),
      indexable: menu.indexable,
      showBadge: menuLimits({ id: menu.ownerId }).showBadge,
    };
  }
}

/** Whether the page is served: enabled and not suspended. */
export function isLive(menu: Pick<Menu, 'enabled' | 'suspendedAt'>): boolean {
  return menu.enabled && menu.suspendedAt === null;
}

function notAvailable(): NotFoundException {
  return new NotFoundException('This menu is not available');
}

function staleRevision(): ConflictException {
  return new ConflictException({
    message: 'The menu was changed somewhere else; reload it',
    code: 'STALE_REVISION',
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
