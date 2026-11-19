import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  MenusAdminService,
  type AdminMenuReportView,
  type AdminMenuView,
} from './menus-admin.service.js';
import {
  adminMenusQuerySchema,
  adminReportsQuerySchema,
  closeReportSchema,
  createMenuSchema,
  itemFlagsSchema,
  itemParamSchema,
  publicSlugParamSchema,
  putContentSchema,
  reportSchema,
  slugCheckSchema,
  suspendSchema,
  updateMenuSchema,
  type AdminMenusQuery,
  type AdminReportsQuery,
  type CloseReportInput,
  type CreateMenuInput,
  type ItemFlagsInput,
  type ItemParam,
  type PublicSlugParam,
  type PutContentInput,
  type ReportInput,
  type SlugCheckQuery,
  type SuspendInput,
  type UpdateMenuInput,
} from './menus.schemas.js';
import {
  MenusService,
  type MenuSummary,
  type MenuView,
  type PublicMenu,
  type SitemapEntry,
} from './menus.service.js';
import type { MenuPlanLimits } from './menu-limits.js';

/** A signed-in person's menus (architecture 4.20). */
@ApiTags('menus')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('menus')
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<{ items: MenuSummary[]; limits: MenuPlanLimits }> {
    return this.menus.list(user);
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createMenuSchema }) body: CreateMenuInput,
  ): Promise<MenuView> {
    return this.menus.create(user, body);
  }

  // Declared before `:id` routes.
  @Get('slug-check')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  slugCheck(
    @CurrentUser() user: AuthUser,
    @Query({ schema: slugCheckSchema }) query: SlugCheckQuery,
  ): Promise<{ available: boolean; reason?: 'taken' | 'reserved' | 'invalid' }> {
    return this.menus.slugCheck(user, query.slug, query.menuId);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<MenuView> {
    return this.menus.get(user, params.id);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateMenuSchema }) body: UpdateMenuInput,
  ): Promise<MenuView> {
    return this.menus.update(user, params.id, body);
  }

  @Put(':id/content')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  putContent(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: putContentSchema }) body: PutContentInput,
  ): Promise<MenuView> {
    return this.menus.putContent(user, params.id, body);
  }

  @Patch(':id/items/:key')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  itemFlags(
    @CurrentUser() user: AuthUser,
    @Param({ schema: itemParamSchema }) params: ItemParam,
    @Body({ schema: itemFlagsSchema }) body: ItemFlagsInput,
  ): Promise<{ revision: number }> {
    return this.menus.setItemFlags(user, params.id, params.key, body);
  }

  @Get(':id/qr.svg')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  qr(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<string> {
    return this.menus.qr(user, params.id);
  }

  /** Deletes the menu: its content and redirects go at once and its link is free. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.menus.remove(user, params.id);
  }
}

/** What anyone can do: read a menu, the sitemap's list, and report a menu. */
@ApiTags('menus')
@Public()
@Controller('menus')
export class MenusPublicController {
  constructor(private readonly menus: MenusService) {}

  /**
   * The menu behind a link. A link that was renamed answers `308` with `Location` the new link's
   * API address and `{ slug }` (the new slug) as the body.
   */
  @Get('p/:slug')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async page(
    @Param({ schema: publicSlugParamSchema }) params: PublicSlugParam,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicMenu | { slug: string }> {
    const found = await this.menus.publicLookup(params.slug);
    if (found.found === 'menu') return found.menu;
    res.status(HttpStatus.PERMANENT_REDIRECT).setHeader('Location', `/v1/menus/p/${found.slug}`);
    return { slug: found.slug };
  }

  @Get('sitemap')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=3600')
  sitemap(): Promise<{ items: SitemapEntry[] }> {
    return this.menus.sitemap();
  }

  @Post('reports')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async report(@Body({ schema: reportSchema }) body: ReportInput, @Ip() ip: string): Promise<void> {
    await this.menus.report(body, ip);
  }
}

/** Admin → Menus: suspending menus and closing abuse reports (architecture 4.20). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/menus')
export class MenusAdminController {
  constructor(private readonly admin: MenusAdminService) {}

  @Get()
  list(
    @Query({ schema: adminMenusQuerySchema }) query: AdminMenusQuery,
  ): Promise<Paginated<AdminMenuView>> {
    return this.admin.list(query);
  }

  // Declared before the `:id` routes.
  @Get('reports')
  reports(
    @Query({ schema: adminReportsQuerySchema }) query: AdminReportsQuery,
  ): Promise<Paginated<AdminMenuReportView>> {
    return this.admin.reports(query);
  }

  @Post('reports/:id/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  closeReport(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: closeReportSchema }) body: CloseReportInput,
  ): Promise<void> {
    return this.admin.closeReport(admin, params.id, body.note);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: suspendSchema }) body: SuspendInput,
  ): Promise<void> {
    return this.admin.suspend(admin, params.id, body.reason);
  }

  @Delete(':id/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsuspend(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.admin.unsuspend(admin, params.id);
  }
}
