import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { attachmentDisposition } from '../projects/project-file-name.js';
import { purchaseParamSchema, type PurchaseParam } from './invoices.schemas.js';
import { InvoicesService, type InvoiceView } from './invoices.service.js';

/** The client's invoices: the team's PDFs and Stripe's (architecture 5, decision 23). */
@ApiTags('portal')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/invoices')
export class PortalInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ items: InvoiceView[] }> {
    return { items: await this.invoices.listForCaller(user) };
  }

  @Get(':id/file')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async file(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<StreamableFile> {
    const file = await this.invoices.download(user, params.id);
    return new StreamableFile(file.stream, {
      type: 'application/pdf',
      length: file.size,
      disposition: attachmentDisposition(file.name),
    });
  }

  @Get('stripe/:purchaseId')
  @Header('Cache-Control', 'private, no-store')
  stripe(
    @CurrentUser() user: AuthUser,
    @Param({ schema: purchaseParamSchema }) params: PurchaseParam,
  ): Promise<{ url: string }> {
    return this.invoices.stripePdf(user, params.purchaseId);
  }
}
