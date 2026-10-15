import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ActivityModule } from './modules/activity/activity.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { AppConfigService } from './config/app-config.service.js';
import { AppConfigModule } from './config/config.module.js';
import { buildLoggerParams } from './config/logger.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { PortfolioModule } from './modules/portfolio/portfolio.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { SavedRepliesModule } from './modules/saved-replies/saved-replies.module.js';
import { StatsModule } from './modules/stats/stats.module.js';
import { ProposalsModule } from './modules/proposals/proposals.module.js';
import { SupportModule } from './modules/support/support.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => buildLoggerParams(config),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    MailModule,
    ActivityModule,
    HealthModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    PostsModule,
    PortfolioModule,
    ProjectsModule,
    MediaModule,
    SavedRepliesModule,
    StatsModule,
    SupportModule,
    ProposalsModule,
  ],
  providers: [
    // Order matters: rate limit first, then authentication, then authorization.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
