import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { DomainAvailabilityController } from './domain-availability.controller.js';
import { DomainsController } from './domains.controller.js';
import { DomainsRepository } from './domains.repository.js';
import { DomainsService } from './domains.service.js';
import { OvhClient } from './ovh.client.js';

@Module({
  imports: [AccountsModule],
  controllers: [DomainsController, DomainAvailabilityController],
  providers: [DomainsService, DomainsRepository, OvhClient],
  exports: [DomainsService],
})
export class DomainsModule {}
