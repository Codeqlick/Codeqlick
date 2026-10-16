import { Module } from '@nestjs/common';
import { CredentialsController } from './credentials.controller.js';
import { CredentialsRepository } from './credentials.repository.js';
import { CredentialsService } from './credentials.service.js';

@Module({
  controllers: [CredentialsController],
  providers: [CredentialsService, CredentialsRepository],
})
export class CredentialsModule {}
