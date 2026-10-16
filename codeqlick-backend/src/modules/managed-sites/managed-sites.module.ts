import { Module } from '@nestjs/common';
import { SiteFormsModule } from '../site-forms/site-forms.module.js';
import { ManagedSitesController } from './managed-sites.controller.js';
import { ManagedSitesRepository } from './managed-sites.repository.js';
import { ManagedSitesService } from './managed-sites.service.js';
import { SiteBuilderClient } from './site-builder.client.js';

@Module({
  imports: [SiteFormsModule],
  controllers: [ManagedSitesController],
  providers: [ManagedSitesService, ManagedSitesRepository, SiteBuilderClient],
  exports: [ManagedSitesService],
})
export class ManagedSitesModule {}
