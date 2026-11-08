import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { StripeModule } from '../managed-sites/stripe.module.js';
import { AdminInvoicesController } from './admin-invoices.controller.js';
import { InvoiceFilesStorage } from './invoice-files.storage.js';
import { InvoicesRepository } from './invoices.repository.js';
import { InvoicesService } from './invoices.service.js';
import { PortalInvoicesController } from './portal-invoices.controller.js';

@Module({
  imports: [AccountsModule, StripeModule],
  controllers: [AdminInvoicesController, PortalInvoicesController],
  providers: [InvoicesService, InvoicesRepository, InvoiceFilesStorage],
})
export class InvoicesModule {}
