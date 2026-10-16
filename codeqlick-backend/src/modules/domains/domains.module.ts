import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { DomainsController } from './domains.controller.js';
import { DomainsRepository } from './domains.repository.js';
import { DomainsService } from './domains.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [DomainsController],
  providers: [DomainsService, DomainsRepository],
  exports: [DomainsService],
})
export class DomainsModule {}
