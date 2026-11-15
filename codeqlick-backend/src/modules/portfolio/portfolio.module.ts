import { Module } from '@nestjs/common';
import { IndexNowModule } from '../indexnow/indexnow.module.js';
import { AdminPortfolioController } from './admin-portfolio.controller.js';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioRepository } from './portfolio.repository.js';
import { PortfolioService } from './portfolio.service.js';

@Module({
  imports: [IndexNowModule],
  controllers: [PortfolioController, AdminPortfolioController],
  providers: [PortfolioService, PortfolioRepository],
})
export class PortfolioModule {}
