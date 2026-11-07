import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { siteFormSchema, type SiteFormInput } from './site-forms.schemas.js';
import { SiteFormsService, type SiteFormView } from './site-forms.service.js';

const keyParamSchema = z.object({ key: z.string().regex(/^[\w-]{16,64}$/) });

/** Shown when a form posts without JavaScript and the page it came from is unknown. */
const PAGES = {
  sent: ['Mensaje enviado', 'Gracias. Tu mensaje se ha enviado correctamente.'],
  error: [
    'No se ha podido enviar',
    'Revisa que has rellenado todos los campos y vuelve a intentarlo.',
  ],
} as const;

function page(kind: keyof typeof PAGES): string {
  const [title, body] = PAGES[kind];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1>${title}</h1><p>${body}</p><p>Puedes cerrar esta página y volver a la web.</p></body></html>`;
}

@ApiTags('forms')
@Controller()
export class SiteFormsController {
  constructor(private readonly forms: SiteFormsService) {}

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/projects/:id/form')
  async get(
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<SiteFormView | { enabled: false }> {
    return (await this.forms.get(params.id)) ?? { enabled: false };
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Put('admin/projects/:id/form')
  save(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: siteFormSchema }) body: SiteFormInput,
  ): Promise<SiteFormView> {
    return this.forms.save(user, params.id, body);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/projects/:id/form/key')
  @HttpCode(HttpStatus.OK)
  replaceKey(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<SiteFormView> {
    return this.forms.replaceKey(user, params.id);
  }

  /**
   * A client site's contact form: a plain HTML form (urlencoded) is redirected back to the site
   * with `form=ok|error`; a script sending JSON gets `{ ok }`.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forms/:key')
  async submit(
    @Param({ schema: keyParamSchema }) params: { key: string },
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Headers('referer') referer: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.forms.submit(params.key, {
      body,
      origin,
      referer,
      wantsJson: contentType?.includes('application/json') ?? false,
    });
    res.status(result.status);
    if ('json' in result) res.json(result.json);
    else if ('redirect' in result) res.redirect(result.status, result.redirect);
    else res.type('html').send(page(result.page));
  }
}
