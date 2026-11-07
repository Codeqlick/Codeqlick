import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { ClientReview } from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { reviewRequestEmail, reviewSubmittedEmail } from './review-emails.js';
import { ReviewsRepository } from './reviews.repository.js';
import type { SubmitReviewInput } from './reviews.schemas.js';

export interface ReviewView {
  /** NONE: not asked for. */
  status: 'NONE' | 'REQUESTED' | 'SUBMITTED' | 'PUBLISHED' | 'HIDDEN';
  rating: number | null;
  quote: string | null;
  authorName: string | null;
  authorRole: string | null;
  consent: boolean;
  locale: ApiLocale;
  submittedAt: string | null;
  publishedAt: string | null;
}

/** What the website shows. */
export interface PublicReview {
  quote: string;
  author: string;
  role: string | null;
  rating: number;
}

function toView(row: ClientReview | null): ReviewView {
  if (!row) {
    return {
      status: 'NONE',
      rating: null,
      quote: null,
      authorName: null,
      authorRole: null,
      consent: false,
      locale: 'en',
      submittedAt: null,
      publishedAt: null,
    };
  }
  return {
    status: row.status,
    rating: row.rating,
    quote: row.quote,
    authorName: row.authorName,
    authorRole: row.authorRole,
    consent: row.consent,
    locale: toApiLocale(row.locale),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

/**
 * The client's review of a finished project: asked for when it is launched (or by the team), sent
 * from the portal, and shown on the website once the team publishes it — only with their consent.
 */
@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly repository: ReviewsRepository,
    private readonly accounts: AccountsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly activity: ActivityService,
  ) {}

  /** Asks the client once per project (an email to every person of the account). */
  async request(actor: ActivityActor, projectId: string): Promise<ReviewView> {
    const project = await this.findProject(projectId);
    const created = await this.repository.createIfMissing(projectId);
    if (created) {
      for (const person of await this.accounts.people(project.clientId)) {
        this.send(
          reviewRequestEmail(
            person,
            project,
            `${this.config.siteUrl}/${person.locale}/portal/projects/${project.id}/review`,
            person.locale,
            this.config.siteUrl,
          ),
        );
      }
      await this.activity.record(actor, {
        action: 'project.review_requested',
        targetId: project.id,
        targetLabel: project.name,
      });
    }
    return toView(created ?? (await this.repository.find(projectId)));
  }

  async getForClient(caller: AuthUser, projectId: string): Promise<ReviewView> {
    await this.projectForClient(caller, projectId);
    return toView(await this.repository.find(projectId));
  }

  /** Sent (or sent again) by the client; a published one goes back to review. */
  async submit(caller: AuthUser, projectId: string, input: SubmitReviewInput): Promise<ReviewView> {
    const project = await this.projectForClient(caller, projectId);
    const existing = await this.repository.find(projectId);
    if (!existing) throw new BadRequestException('No review was asked for this project');
    const row = await this.repository.update(projectId, {
      status: 'SUBMITTED',
      rating: input.rating,
      quote: input.quote,
      authorName: input.authorName,
      authorRole: input.authorRole || null,
      consent: input.consent,
      locale: toDbLocale(input.locale),
      submittedAt: new Date(),
      publishedAt: null,
    });
    this.send(
      reviewSubmittedEmail(
        this.config.leadsNotifyTo,
        { name: caller.name, email: caller.email },
        project,
        { rating: input.rating, quote: input.quote, consent: input.consent },
        `${this.config.siteUrl}/es/admin/projects/${project.id}#review`,
        this.config.siteUrl,
      ),
    );
    await this.activity.record(caller, {
      action: 'project.review_submitted',
      targetId: project.id,
      targetLabel: project.name,
      details: { rating: input.rating },
    });
    return toView(row);
  }

  async getForTeam(projectId: string): Promise<ReviewView> {
    await this.findProject(projectId);
    return toView(await this.repository.find(projectId));
  }

  /** Publishes it on the website (only with consent) or hides it. */
  async setStatus(
    actor: AuthUser,
    projectId: string,
    status: 'PUBLISHED' | 'HIDDEN',
  ): Promise<ReviewView> {
    const project = await this.findProject(projectId);
    const review = await this.repository.find(projectId);
    if (!review || review.status === 'REQUESTED')
      throw new NotFoundException('No review to publish');
    if (status === 'PUBLISHED' && !review.consent) {
      throw new BadRequestException('The client did not allow it on the website');
    }
    const row = await this.repository.update(projectId, {
      status,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
    });
    await this.activity.record(actor, {
      action: status === 'PUBLISHED' ? 'project.review_published' : 'project.review_hidden',
      targetId: project.id,
      targetLabel: project.name,
    });
    return toView(row);
  }

  async published(locale: ApiLocale, limit: number): Promise<PublicReview[]> {
    return (await this.repository.published(toDbLocale(locale), limit)).map((row) => ({
      quote: row.quote ?? '',
      author: row.authorName ?? '',
      role: row.authorRole,
      rating: row.rating ?? 5,
    }));
  }

  private async projectForClient(caller: AuthUser, projectId: string) {
    const project = await this.repository.findProject(projectId);
    if (!project || (caller.role !== 'ADMIN' && project.clientId !== accountOf(caller))) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private async findProject(id: string) {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private send(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Review email to ${message.to} failed: ${reason}`);
    });
  }
}
