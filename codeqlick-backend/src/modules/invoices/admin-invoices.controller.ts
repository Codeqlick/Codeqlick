import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { UploadedProjectFile } from '../projects/projects.service.js';
import {
  createInvoiceSchema,
  setInvoicePaidSchema,
  type CreateInvoiceInput,
  type SetInvoicePaidInput,
} from './invoices.schemas.js';
import { InvoicesService, MAX_INVOICE_BYTES, type InvoiceView } from './invoices.service.js';

/** The team's invoices of a project (architecture 5, decision 23). */
@ApiTags('admin/invoices')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get('projects/:id/invoices')
  list(@Param({ schema: idParamSchema }) params: IdParam): Promise<InvoiceView[]> {
    return this.invoices.listForProject(params.id);
  }

  @Post('projects/:id/invoices')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_INVOICE_BYTES, files: 1 },
      defParamCharset: 'utf8',
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createInvoiceSchema }) body: CreateInvoiceInput,
    @UploadedFile() file: UploadedProjectFile | undefined,
  ): Promise<InvoiceView> {
    return this.invoices.create(user, params.id, body, file);
  }

  @Patch('invoices/:id')
  setPaid(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: setInvoicePaidSchema }) body: SetInvoicePaidInput,
  ): Promise<InvoiceView> {
    return this.invoices.setPaid(user, params.id, body.paid);
  }

  @Delete('invoices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.invoices.delete(user, params.id);
  }
}
