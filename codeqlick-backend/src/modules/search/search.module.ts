import { Module } from '@nestjs/common';
import { AdminSearchController } from './admin-search.controller.js';
import { SearchRepository } from './search.repository.js';
import { SearchService } from './search.service.js';

@Module({
  controllers: [AdminSearchController],
  providers: [SearchService, SearchRepository],
})
export class SearchModule {}
