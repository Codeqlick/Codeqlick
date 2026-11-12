import {
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { CloudAudit } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { gather } from '../site-audits/gather.js';
import { assertCheckableUrl } from '../site-audits/safe-fetch.js';
import { runChecks, scoreOf } from '../site-audits/site-audit-checks.js';
import { failureText } from '../site-audits/site-audit-texts.js';
import {
  reportCategories,
  type SiteAuditReport,
  type StoredResult,
} from '../site-audits/site-audits.service.js';
import type { CloudCtx } from './cloud-caller.js';
import { CloudAuditsRepository } from './cloud-audits.repository.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface CloudAuditReport {
  id: string;
  url: string;
  finalUrl: string;
  score: number;
  categories: SiteAuditReport['categories'];
  createdAt: string;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
const TIMEOUT = 60_000;

/** The free website check for developers, with a token and no lead or email (architecture 4.13). */
@Injectable()
export class CloudAuditsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudAuditsService.name);
  private timer?: NodeJS.Timeout;
  /** Replaced in tests: the real one fetches the site. */
  gatherInputs = (url: string) => gather(url, this.config.pageSpeedApiKey);

  constructor(
    private readonly repository: CloudAuditsRepository,
    private readonly teams: CloudTeamsService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.cleanup(), DAY).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(now = new Date()): Promise<void> {
    await this.repository
      .deleteBefore(new Date(now.getTime() - 30 * DAY))
      .catch((error: unknown) =>
        this.logger.error(`Cloud audits cleanup failed: ${String(error)}`),
      );
  }

  private report(row: CloudAudit, locale: ApiLocale): CloudAuditReport {
    const result = row.result as unknown as StoredResult;
    return {
      id: row.id,
      url: row.url,
      finalUrl: result.finalUrl,
      score: row.score,
      categories: reportCategories(result, locale),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async run(
    ctx: CloudCtx,
    input: { url: string; teamSlug: string; locale: ApiLocale },
  ): Promise<CloudAuditReport> {
    const membership = await this.teams.access(ctx, input.teamSlug);
    let url: URL;
    try {
      url = new URL(input.url);
      assertCheckableUrl(url);
    } catch {
      throw new BadRequestException(
        'Use an http(s) address on port 80 or 443, without a user or password',
      );
    }
    const limit = CLOUD_PLANS[membership.team.plan].auditsPerHour;
    if (
      (await this.repository.countSince(membership.teamId, new Date(Date.now() - HOUR))) >= limit
    ) {
      throw new HttpException(
        `At most ${limit} website checks an hour per team`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let timer: NodeJS.Timeout | undefined;
    let result: StoredResult;
    try {
      const inputs = await Promise.race([
        this.gatherInputs(url.toString()),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new GatewayTimeoutException('The check took over 60 seconds')),
            TIMEOUT,
          );
        }),
      ]);
      const checks = runChecks(inputs);
      const { categories } = scoreOf(checks);
      result = { finalUrl: inputs.page.url, categories, checks };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new UnprocessableEntityException(failureText(reason, input.locale));
    } finally {
      if (timer) clearTimeout(timer);
    }
    const row = await this.repository.create({
      teamId: membership.teamId,
      userId: ctx.user.id,
      url: url.toString(),
      score: scoreOf(result.checks).score,
      result: result as never,
    });
    await this.teams.record(ctx, membership.teamId, 'audit.run', url.host, { score: row.score });
    return this.report(row, input.locale);
  }

  async list(ctx: CloudCtx, teamSlug: string, page: number, pageSize: number) {
    const membership = await this.teams.access(ctx, teamSlug);
    const { skip, take } = pageToSkipTake(page, pageSize);
    const [rows, total] = await this.repository.list(membership.teamId, skip, take);
    const items = rows.map((row) => ({
      id: row.id,
      url: row.url,
      score: row.score,
      createdAt: row.createdAt.toISOString(),
    }));
    return paginate(items, total, page, pageSize) as Paginated<(typeof items)[number]>;
  }

  async get(ctx: CloudCtx, id: string, locale: ApiLocale): Promise<CloudAuditReport> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException('Website check not found');
    await this.teams.accessById(ctx, row.teamId);
    return this.report(row, locale);
  }
}
