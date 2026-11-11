import { randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { siteFormEmail } from './site-form-emails.js';
import { allowedOrigins, returnUrl } from './site-form-origin.js';
import { SiteFormsRepository, type FormRow } from './site-forms.repository.js';
import { submissionSchema, type SiteFormInput } from './site-forms.schemas.js';

export interface SiteFormView {
  enabled: boolean;
  key: string;
  recipients: string[];
  /** Where posts are accepted from: the origins of the project's production and staging URLs. */
  origins: string[];
  submissions: number;
  lastSubmissionAt: string | null;
}

/** What the public endpoint answers: JSON for scripts, a redirect (or a short page) for forms. */
export type SubmitResult =
  | { status: number; json: { ok: boolean } }
  | { status: number; redirect: string }
  | { status: number; page: 'sent' | 'error' };

export interface SubmitRequest {
  body: unknown;
  origin?: string;
  referer?: string;
  wantsJson: boolean;
}

/** A message a managed site's form kept, as the portal shows it. */
export interface KeptMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  createdAt: string;
}

const newKey = () => randomBytes(18).toString('base64url');
const DAY_MS = 86_400_000;
/** How long managed sites' form messages are kept (decision 31). */
export const KEEP_MESSAGES_DAYS = 365;

/**
 * Contact forms of the client sites the team hosts: a static site posts its form to
 * `/v1/forms/:key` and the message is emailed to the client. A managed site's messages are also
 * kept 12 months for the portal (decision 31); other sites' only add to the counter.
 */
@Injectable()
export class SiteFormsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SiteFormsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repository: SiteFormsRepository,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.deleteOldMessages(), DAY_MS).unref();
    void this.deleteOldMessages();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async get(projectId: string): Promise<SiteFormView | null> {
    await this.findProject(projectId);
    const form = await this.repository.findByProject(projectId);
    return form ? this.view(form) : null;
  }

  async save(actor: AuthUser, projectId: string, input: SiteFormInput): Promise<SiteFormView> {
    const project = await this.findProject(projectId);
    const recipients = [...new Set(input.recipients.map((email) => email.toLowerCase()))];
    const form = await this.repository.upsert(
      projectId,
      { enabled: input.enabled, recipients },
      newKey(),
    );
    await this.activity.record(actor, {
      action: 'project.form_updated',
      targetId: projectId,
      targetLabel: project.name,
      details: { enabled: input.enabled },
    });
    return this.view(form);
  }

  async replaceKey(actor: AuthUser, projectId: string): Promise<SiteFormView> {
    const project = await this.findProject(projectId);
    if (!(await this.repository.findByProject(projectId))) {
      throw new NotFoundException('The project has no form');
    }
    const form = await this.repository.setKey(projectId, newKey());
    await this.activity.record(actor, {
      action: 'project.form_key_replaced',
      targetId: projectId,
      targetLabel: project.name,
    });
    return this.view(form);
  }

  /** A post from a site's form. */
  async submit(key: string, request: SubmitRequest, now = new Date()): Promise<SubmitResult> {
    const form = await this.repository.findByKey(key);
    if (!form || !form.enabled) throw new NotFoundException('Form not found');
    const allowed = allowedOrigins([form.project.productionUrl, form.project.stagingUrl]);
    if (request.origin && request.origin !== 'null' && !allowed.includes(request.origin)) {
      throw new ForbiddenException('This form does not accept posts from that site');
    }

    const parsed = submissionSchema.safeParse(request.body ?? {});
    const redirect =
      request.body && typeof request.body === 'object' && 'redirect' in request.body
        ? String((request.body as { redirect: unknown }).redirect)
        : undefined;
    const answer = (ok: boolean): SubmitResult => {
      const status = ok ? 200 : 400;
      if (request.wantsJson) return { status, json: { ok } };
      const back = returnUrl([redirect, request.referer], allowed, ok ? 'ok' : 'error');
      return back ? { status: 303, redirect: back } : { status, page: ok ? 'sent' : 'error' };
    };
    if (!parsed.success) return answer(false);
    // A bot filled in the honeypot: pretend it worked.
    if (parsed.data.website) return answer(true);

    // Kept before emailing, so a failed email doesn't lose it.
    let kept = false;
    if (form.project.site) {
      try {
        await this.repository.keepMessage(form.id, parsed.data, now);
        kept = true;
      } catch (error) {
        this.logger.error(`Could not keep a message of ${form.project.name}`, error);
      }
    }
    await this.mail.send(
      siteFormEmail(
        form.recipients,
        {
          project: form.project.name,
          url: form.project.productionUrl,
          messagesUrl: kept
            ? `${this.config.siteUrl}/es/portal/projects/${form.project.id}/site/messages`
            : undefined,
        },
        parsed.data,
        this.config.siteUrl,
      ),
    );
    try {
      await this.repository.countSubmission(form.id, now);
    } catch (error) {
      this.logger.error(`Could not count a message of ${form.project.name}`, error);
    }
    return answer(true);
  }

  /** Messages per Madrid day since `since`, for the visits chart. */
  messagesByDay(projectId: string, since: Date): Promise<Map<string, number>> {
    return this.repository.messagesByDay(projectId, since);
  }

  /** A project's kept messages, newest first. Who may read them is checked by the caller. */
  async messages(
    projectId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<KeptMessage>> {
    const { skip, take } = pageToSkipTake(page, pageSize);
    const { items, total } = await this.repository.messages(projectId, skip, take);
    return paginate(
      items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    );
  }

  async deleteMessage(projectId: string, messageId: string): Promise<void> {
    if (!(await this.repository.deleteMessage(projectId, messageId))) {
      throw new NotFoundException('Message not found');
    }
  }

  /** Deletes the kept messages older than 12 months; answers how many. */
  async deleteOldMessages(now = new Date()): Promise<number> {
    try {
      const deleted = await this.repository.deleteMessagesBefore(
        new Date(now.getTime() - KEEP_MESSAGES_DAYS * DAY_MS),
      );
      if (deleted) this.logger.log(`Deleted ${deleted} form messages older than 12 months`);
      return deleted;
    } catch (error) {
      this.logger.error(`Form message cleanup failed: ${String(error)}`);
      return 0;
    }
  }

  private async findProject(id: string) {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private view(form: FormRow): SiteFormView {
    return {
      enabled: form.enabled,
      key: form.key,
      recipients: form.recipients,
      origins: allowedOrigins([form.project.productionUrl, form.project.stagingUrl]),
      submissions: form.submissions,
      lastSubmissionAt: form.lastSubmissionAt?.toISOString() ?? null,
    };
  }
}
