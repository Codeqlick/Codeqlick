import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

const newKey = () => randomBytes(18).toString('base64url');

/**
 * Contact forms of the client sites the team hosts: a static site posts its form to
 * `/v1/forms/:key` and the message is emailed to the client. Nothing but a counter is stored.
 */
@Injectable()
export class SiteFormsService {
  private readonly logger = new Logger(SiteFormsService.name);

  constructor(
    private readonly repository: SiteFormsRepository,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

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

    await this.mail.send(
      siteFormEmail(
        form.recipients,
        { project: form.project.name, url: form.project.productionUrl },
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
