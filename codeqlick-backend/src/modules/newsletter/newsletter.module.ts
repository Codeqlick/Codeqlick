import { Module } from '@nestjs/common';
import { AdminNewsletterController } from './admin-newsletter.controller.js';
import { NewsletterController } from './newsletter.controller.js';
import { NewsletterRepository } from './newsletter.repository.js';
import { NewsletterService } from './newsletter.service.js';

@Module({
  controllers: [NewsletterController, AdminNewsletterController],
  providers: [NewsletterService, NewsletterRepository],
})
export class NewsletterModule {}
