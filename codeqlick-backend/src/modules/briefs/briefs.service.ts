import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { ProjectBrief } from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { hashKey } from '../projects/release-key.js';
import { briefRequestEmail, briefSubmittedEmail } from './brief-emails.js';
import { BriefsRepository, type ProjectRef } from './briefs.repository.js';
import {
  briefAnswersSchema,
  REQUIRED_TO_SUBMIT,
  type BriefAnswers,
  type SaveBriefInput,
} from './briefs.schemas.js';

export interface BriefView {
  /** NONE: not asked for yet. */
  status: 'NONE' | 'REQUESTED' | 'SUBMITTED';
  answers: BriefAnswers;
  requestedAt: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
}

function toView(brief: ProjectBrief | null): BriefView {
  if (!brief) {
    return { status: 'NONE', answers: {}, requestedAt: null, submittedAt: null, updatedAt: null };
  }
  const answers = briefAnswersSchema.safeParse(brief.answers);
  return {
    status: brief.status,
    answers: answers.success ? answers.data : {},
    requestedAt: brief.requestedAt.toISOString(),
    submittedAt: brief.submittedAt?.toISOString() ?? null,
    updatedAt: brief.updatedAt.toISOString(),
  };
}

/**
 * The project brief: the client's answers about goals, audience, must-haves, brand and deadlines.
 * Asked for when a client starts (lead converted, proposal accepted) or by the team; read in the
 * admin panel and, with the project's release key, from the repository.
 */
@Injectable()
export class BriefsService {
  private readonly logger = new Logger(BriefsService.name);

  constructor(
    private readonly repository: BriefsRepository,
    private readonly accounts: AccountsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly activity: ActivityService,
  ) {}

  /** The client's view (or an admin's in the portal). */
  async getForClient(caller: AuthUser, projectId: string): Promise<BriefView> {
    await this.projectForClient(caller, projectId);
    return toView(await this.repository.find(projectId));
  }

  /** Saves the answers; with `submit`, sends it to the team (the essential ones are required). */
  async save(caller: AuthUser, projectId: string, input: SaveBriefInput): Promise<BriefView> {
    const project = await this.projectForClient(caller, projectId);
    if (input.submit) {
      const missing = REQUIRED_TO_SUBMIT.filter((key) => !input.answers[key]?.trim());
      if (missing.length > 0) {
        throw new BadRequestException({
          errors: missing.map((key) => ({
            path: `answers.${key}`,
            message: 'Required to send it',
          })),
        });
      }
    }
    const before = await this.repository.find(projectId);
    const brief = await this.repository.save(projectId, input.answers, input.submit);
    if (input.submit) {
      this.send(
        briefSubmittedEmail(
          this.config.leadsNotifyTo,
          { name: caller.name, email: caller.email },
          project,
          input.answers.goals ?? '',
          `${this.config.siteUrl}/es/admin/projects/${project.id}#brief`,
          this.config.siteUrl,
        ),
      );
      await this.activity.record(caller, {
        action:
          before?.status === 'SUBMITTED' ? 'project.brief_updated' : 'project.brief_submitted',
        targetId: project.id,
        targetLabel: project.name,
      });
    }
    return toView(brief);
  }

  async getForTeam(projectId: string): Promise<BriefView> {
    await this.findProject(projectId);
    return toView(await this.repository.find(projectId));
  }

  /**
   * Asks the client for the brief: creates it if missing and, with `notify`, emails every person
   * of the account. A brief already sent is not asked for again.
   */
  async request(actor: ActivityActor, projectId: string, notify: boolean): Promise<BriefView> {
    const project = await this.findProject(projectId);
    const { brief } = await this.repository.ensure(projectId);
    if (notify && brief.status !== 'SUBMITTED') {
      for (const person of await this.accounts.people(project.clientId)) {
        this.send(
          briefRequestEmail(
            person,
            project,
            `${this.config.siteUrl}/${person.locale}/portal/projects/${project.id}/brief`,
            person.locale,
            this.config.siteUrl,
          ),
        );
      }
      await this.activity.record(actor, {
        action: 'project.brief_requested',
        targetId: project.id,
        targetLabel: project.name,
      });
    }
    return toView(brief);
  }

  /** From the repository, with the project's release key. */
  async getWithKey(key: string): Promise<BriefView & { project: { id: string; name: string } }> {
    const project = key ? await this.repository.findProjectByKeyHash(hashKey(key)) : null;
    if (!project) throw new UnauthorizedException('Unknown release key');
    return {
      project: { id: project.id, name: project.name },
      ...toView(await this.repository.find(project.id)),
    };
  }

  // ---- Helpers --------------------------------------------------------------------------

  private async projectForClient(caller: AuthUser, projectId: string): Promise<ProjectRef> {
    const project = await this.repository.findProject(projectId);
    if (!project || (caller.role !== 'ADMIN' && project.clientId !== accountOf(caller))) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private async findProject(id: string): Promise<ProjectRef> {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private send(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Brief email to ${message.to} failed: ${reason}`);
    });
  }
}
