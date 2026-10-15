import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { BriefsController } from './briefs.controller.js';
import { BriefsRepository } from './briefs.repository.js';
import { BriefsService } from './briefs.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [BriefsController],
  providers: [BriefsService, BriefsRepository],
  exports: [BriefsService],
})
export class BriefsModule {}
