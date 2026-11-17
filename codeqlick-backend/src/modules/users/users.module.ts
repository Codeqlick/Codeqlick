import { Module } from '@nestjs/common';
import { AdultModule } from '../adult/adult.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminUsersController } from './admin-users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, AdultModule],
  controllers: [AdminUsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
