import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { NoFilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import { MAX_TOTAL } from './cloud-form-fields.js';
import {
  createFormSchema,
  formKeyParamSchema,
  formParamSchema,
  markSpamSchema,
  submissionParamSchema,
  submissionsQuerySchema,
  updateFormSchema,
  type CreateFormInput,
  type FormKeyParam,
  type FormParam,
  type MarkSpamInput,
  type SubmissionParam,
  type SubmissionsQuery,
  type UpdateFormInput,
} from './cloud.schemas.js';
import { CloudFormsService, type FormView, type SubmissionView } from './cloud-forms.service.js';

/** Shown to a plain form whose page isn't one of the project's addresses. */
const PAGES = {
  sent: [
    'Enviado · Sent',
    'Gracias, tu mensaje se ha enviado.',
    'Thank you, your message was sent.',
  ],
  error: [
    'No se ha podido enviar · Not sent',
    'Revisa el formulario y vuelve a intentarlo.',
    'Check the form and try again.',
  ],
} as const;

function page(kind: keyof typeof PAGES): string {
  const [title, es, en] = PAGES[kind];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1>${title}</h1><p>${es}</p><p lang="en">${en}</p><p><a href="javascript:history.back()">← Volver · Back</a></p></body></html>`;
}

/** The endpoint every form of a Cloud project posts to (architecture 4.13, Forms). */
@ApiTags('cloud')
@Public()
@Controller('cloud/forms')
export class CloudFormsPublicController {
  constructor(private readonly forms: CloudFormsService) {}

  @Post(':key')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(NoFilesInterceptor({ limits: { fields: 40, fieldSize: MAX_TOTAL, files: 0 } }))
  async submit(
    @Param({ schema: formKeyParamSchema }) params: FormKeyParam,
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Headers('referer') referer: string | undefined,
    @Headers('accept') accept: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const wantsJson =
      (contentType?.includes('application/json') ?? false) ||
      (accept?.includes('application/json') ?? false);
    const result = await this.forms.submit(params.key, { body, origin, referer, wantsJson });
    res.status(result.status);
    if ('json' in result) res.json(result.json);
    else if ('redirect' in result) res.redirect(result.status, result.redirect);
    else res.type('html').send(page(result.page));
  }
}

/** A project's forms and their submissions, for its team (session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud/projects/:id/forms')
export class CloudFormsController {
  constructor(private readonly forms: CloudFormsService) {}

  @Get()
  async list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ items: FormView[] }> {
    return { items: await this.forms.list(ctx, params.id) };
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createFormSchema }) body: CreateFormInput,
  ): Promise<FormView> {
    return this.forms.create(ctx, params.id, body);
  }

  @Patch(':formId')
  update(
    @Caller() ctx: CloudCtx,
    @Param({ schema: formParamSchema }) params: FormParam,
    @Body({ schema: updateFormSchema }) body: UpdateFormInput,
  ): Promise<FormView> {
    return this.forms.update(ctx, params.id, params.formId, body);
  }

  @Post(':formId/key')
  @HttpCode(HttpStatus.OK)
  replaceKey(
    @Caller() ctx: CloudCtx,
    @Param({ schema: formParamSchema }) params: FormParam,
  ): Promise<FormView> {
    return this.forms.replaceKey(ctx, params.id, params.formId);
  }

  @Delete(':formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: formParamSchema }) params: FormParam,
  ): Promise<void> {
    return this.forms.remove(ctx, params.id, params.formId);
  }

  @Get(':formId/submissions')
  submissions(
    @Caller() ctx: CloudCtx,
    @Param({ schema: formParamSchema }) params: FormParam,
    @Query({ schema: submissionsQuerySchema }) query: SubmissionsQuery,
  ): Promise<Paginated<SubmissionView>> {
    return this.forms.submissions(
      ctx,
      params.id,
      params.formId,
      query.q,
      query.spam,
      query.page,
      query.pageSize,
    );
  }

  @Get(':formId/submissions.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(
    @Caller() ctx: CloudCtx,
    @Param({ schema: formParamSchema }) params: FormParam,
    @Res() res: Response,
  ): Promise<void> {
    const { name, body } = await this.forms.csv(ctx, params.id, params.formId);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(body);
  }

  @Delete(':formId/submissions/:submissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSubmission(
    @Caller() ctx: CloudCtx,
    @Param({ schema: submissionParamSchema }) params: SubmissionParam,
  ): Promise<void> {
    return this.forms.removeSubmission(ctx, params.id, params.formId, params.submissionId);
  }

  @Post(':formId/submissions/:submissionId/spam')
  @HttpCode(HttpStatus.OK)
  markSpam(
    @Caller() ctx: CloudCtx,
    @Param({ schema: submissionParamSchema }) params: SubmissionParam,
    @Body({ schema: markSpamSchema }) body: MarkSpamInput,
  ): Promise<SubmissionView> {
    return this.forms.markSpam(ctx, params.id, params.formId, params.submissionId, body.spam);
  }
}
