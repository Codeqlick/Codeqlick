import { Module } from '@nestjs/common';
import { SiteFormsController } from './site-forms.controller.js';
import { SiteFormsRepository } from './site-forms.repository.js';
import { SiteFormsService } from './site-forms.service.js';

@Module({
  controllers: [SiteFormsController],
  providers: [SiteFormsService, SiteFormsRepository],
})
export class SiteFormsModule {}
