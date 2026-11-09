import { Module } from '@nestjs/common';
import { ErrorsController } from './errors.controller.js';
import { ErrorsRepository } from './errors.repository.js';
import { ErrorsService } from './errors.service.js';

@Module({
  controllers: [ErrorsController],
  providers: [ErrorsService, ErrorsRepository],
  exports: [ErrorsService],
})
export class ErrorsModule {}
