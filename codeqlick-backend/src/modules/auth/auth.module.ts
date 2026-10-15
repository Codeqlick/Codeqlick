import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenCleanupService } from './token-cleanup.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): JwtModuleOptions => ({
        secret: config.jwtAccessSecret,
        signOptions: { algorithm: 'HS256', expiresIn: config.jwtAccessTtl },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, PasswordService, TokenCleanupService],
  // JwtModule is re-exported for the global JwtAuthGuard registered in AppModule; AuthService
  // for the welcome emails sent from the users module.
  exports: [JwtModule, PasswordService, AuthService],
})
export class AuthModule {}
