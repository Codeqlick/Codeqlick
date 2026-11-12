import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { CloudForm } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import type { CloudCtx } from './cloud-caller.js';
import { cloudFormEmail, cloudFormsLimitEmail } from './cloud-emails.js';
import {
  fromStored,
  isProjectOrigin,
  madridMonth,
  originOf,
  pageOf,
  parseSubmission,
  toCsv,
  toStored,
} from './cloud-form-fields.js';
import { CloudFormsRepository, type FormWithProject } from './cloud-forms.repository.js';
import { CLOUD_PLANS, FORM_SUBMISSION_DAYS } from './cloud-plans.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudRepository } from './cloud.repository.js';
import type { CreateFormInput, UpdateFormInput } from './cloud.schemas.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface FormView {
  id: string;
  name: string;
  key: string;
  endpoint: string;
  enabled: boolean;
  notify: boolean;
  recipientIds: string[];
  submissions: number;
  createdAt: string;
}

export interface SubmissionView {
  id: string;
  data: Record<string, string>;
  email: string | null;
  page: string | null;
  createdAt: string;
}

/** What the public endpoint answers: JSON for scripts, a redirect or a short page for forms. */
export type FormAnswer =
  | { status: number; json: { ok: boolean; error?: string } }
  | { status: number; redirect: string }
  | { status: number; page: 'sent' | 'error' };

export interface FormPost {
  body: unknown;
  origin?: string;
  referer?: string;
  wantsJson: boolean;
}

const DAY_MS = 86_400_000;
const newKey = () => `cqf_${randomBytes(16).toString('base64url')}`;

/** Forms of Cloud projects (architecture 4.13, Forms; decision 37). */
@Injectable()
export class CloudFormsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudFormsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly forms: CloudFormsRepository,
    private readonly cloud: CloudRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.cleanup(), DAY_MS).unref();
    void this.cleanup();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(now = new Date()): Promise<void> {
    try {
      await this.forms.deleteSubmissionsBefore(
        new Date(now.getTime() - FORM_SUBMISSION_DAYS * DAY_MS),
      );
    } catch (error) {
      this.logger.error(`Form submissions cleanup failed: ${String(error)}`);
    }
  }

  private view(form: CloudForm, submissions: number): FormView {
    return {
      id: form.id,
      name: form.name,
      key: form.key,
      endpoint: `${this.config.publicApiUrl}/cloud/forms/${form.key}`,
      enabled: form.enabled,
      notify: form.notify,
      recipientIds: form.recipientIds,
      submissions,
      createdAt: form.createdAt.toISOString(),
    };
  }

  /** The recipients must be members of the project's team (decision 37). */
  private async checkRecipients(teamId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const members = await this.forms.membersAmong(teamId, unique);
    if (members.length !== unique.length) {
      throw new BadRequestException('Recipients must be members of the team');
    }
    return unique;
  }

  private async form(
    ctx: CloudCtx,
    projectId: string,
    formId: string,
    min: 'MEMBER' | 'ADMIN' = 'MEMBER',
  ) {
    const { project, membership } = await this.projects.project(ctx, projectId, min);
    const form = await this.forms.find(project.id, formId);
    if (!form) throw new NotFoundException('Form not found');
    return { project, membership, form };
  }

  async list(ctx: CloudCtx, projectId: string): Promise<FormView[]> {
    const { project } = await this.projects.project(ctx, projectId);
    return (await this.forms.list(project.id)).map((form) =>
      this.view(form, form._count.submissions),
    );
  }

  async create(ctx: CloudCtx, projectId: string, input: CreateFormInput): Promise<FormView> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const limits = CLOUD_PLANS[membership.team.plan];
    if ((await this.forms.count(project.id)) >= limits.formsPerProject) {
      throw new ConflictException(`A project has at most ${limits.formsPerProject} forms`);
    }
    const recipientIds = await this.checkRecipients(project.teamId, input.recipientIds);
    const form = await this.forms.create({
      projectId: project.id,
      name: input.name,
      key: newKey(),
      notify: input.notify,
      recipientIds,
    });
    await this.teams.record(ctx, project.teamId, 'form.created', `${project.slug}: ${form.name}`);
    return this.view(form, 0);
  }

  async update(
    ctx: CloudCtx,
    projectId: string,
    formId: string,
    input: UpdateFormInput,
  ): Promise<FormView> {
    const { project, form } = await this.form(ctx, projectId, formId, 'ADMIN');
    const recipientIds = input.recipientIds
      ? await this.checkRecipients(project.teamId, input.recipientIds)
      : undefined;
    const updated = await this.forms.update(form.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.notify !== undefined ? { notify: input.notify } : {}),
      ...(recipientIds ? { recipientIds } : {}),
    });
    await this.teams.record(
      ctx,
      project.teamId,
      'form.updated',
      `${project.slug}: ${updated.name}`,
    );
    return this.view(updated, await this.forms.submissionsCount(form.id));
  }

  async replaceKey(ctx: CloudCtx, projectId: string, formId: string): Promise<FormView> {
    const { project, form } = await this.form(ctx, projectId, formId, 'ADMIN');
    const updated = await this.forms.update(form.id, { key: newKey() });
    await this.teams.record(
      ctx,
      project.teamId,
      'form.key_replaced',
      `${project.slug}: ${form.name}`,
    );
    return this.view(updated, await this.forms.submissionsCount(form.id));
  }

  async remove(ctx: CloudCtx, projectId: string, formId: string): Promise<void> {
    const { project, form } = await this.form(ctx, projectId, formId, 'ADMIN');
    await this.forms.remove(form.id);
    await this.teams.record(ctx, project.teamId, 'form.deleted', `${project.slug}: ${form.name}`);
  }

  async submissions(
    ctx: CloudCtx,
    projectId: string,
    formId: string,
    q: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<Paginated<SubmissionView>> {
    const { form } = await this.form(ctx, projectId, formId);
    const { skip, take } = pageToSkipTake(page, pageSize);
    const [rows, total] = await this.forms.submissions(form.id, q, skip, take);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        data: fromStored(row.data),
        email: row.email,
        page: row.page,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async csv(
    ctx: CloudCtx,
    projectId: string,
    formId: string,
  ): Promise<{ name: string; body: string }> {
    const { project, form } = await this.form(ctx, projectId, formId);
    const rows = await this.forms.allSubmissions(form.id);
    const body = toCsv(rows.map((row) => ({ ...row, data: fromStored(row.data) })));
    const safe = `${project.slug}-${form.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return { name: `${safe || 'form'}.csv`, body };
  }

  async removeSubmission(
    ctx: CloudCtx,
    projectId: string,
    formId: string,
    id: string,
  ): Promise<void> {
    const { form } = await this.form(ctx, projectId, formId);
    if (!(await this.forms.deleteSubmission(form.id, id)))
      throw new NotFoundException('Submission not found');
  }

  // ── The public endpoint ────────────────────────────────────────────────────────────────────

  async submit(key: string, post: FormPost, now = new Date()): Promise<FormAnswer> {
    const form = await this.forms.findByKey(key);
    if (!form || !form.enabled || form.project.deletedAt || form.project.suspendedAt) {
      throw new NotFoundException('Form not found');
    }
    const hosting = this.config.cloudHosting?.domain ?? 'codeqlick.app';
    const project = {
      slug: form.project.slug,
      hostingDomain: hosting,
      domains: form.project.domains.filter((d) => d.state !== 'PENDING').map((d) => d.name),
    };
    if (post.origin && post.origin !== 'null' && !isProjectOrigin(post.origin, project)) {
      throw new ForbiddenException("This form doesn't accept posts from that site");
    }

    const parsed = parseSubmission(post.body);
    const redirect = parsed.ok ? parsed.value.redirect : null;
    const answer = (ok: boolean, error?: string, status?: number): FormAnswer => {
      if (post.wantsJson)
        return { status: status ?? (ok ? 200 : 400), json: ok ? { ok } : { ok, error } };
      for (const candidate of [redirect, post.referer]) {
        const origin = originOf(candidate);
        if (!candidate || !origin || !isProjectOrigin(origin, project)) continue;
        const url = new URL(candidate);
        url.searchParams.set('form', ok ? 'ok' : 'error');
        return { status: 303, redirect: url.toString() };
      }
      return { status: status ?? (ok ? 200 : 400), page: ok ? 'sent' : 'error' };
    };
    if (!parsed.ok) return answer(false, parsed.error);
    // A bot filled in the honeypot: pretend it worked, keep nothing.
    if (parsed.value.spam) return answer(true);

    const month = madridMonth(now);
    const limit = CLOUD_PLANS[form.project.team.plan].formSubmissionsPerMonth;
    if ((await this.forms.teamSubmissionsSince(form.project.teamId, month.start)) >= limit) {
      void this.warnLimit(form, limit, month.key);
      if (post.wantsJson)
        throw new HttpException(
          'This form reached its monthly limit',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      return answer(false, 'limit', HttpStatus.TOO_MANY_REQUESTS);
    }

    const page = pageOf(post.referer);
    await this.forms.keep(form.id, toStored(parsed.value.fields), parsed.value.email, page);
    if (form.notify) void this.notify(form, parsed.value, page);
    return answer(true);
  }

  private async notify(
    form: FormWithProject,
    value: { fields: Record<string, string>; email: string | null; subject: string | null },
    page: string | null,
  ): Promise<void> {
    try {
      const url = `${this.config.cloudUrl}/es/console/${form.project.team.slug}/${form.project.slug}?tab=forms&form=${form.id}`;
      for (const person of await this.forms.recipients(form.project.teamId, form.recipientIds)) {
        const locale = toApiLocale(person.locale);
        await this.mail.send(
          cloudFormEmail({
            to: person.email,
            locale,
            project: form.project.name,
            form: form.name,
            subject: value.subject,
            fields: value.fields,
            replyTo: value.email,
            page,
            url: url.replace('/es/', `/${locale}/`),
            siteUrl: this.config.siteUrl,
          }),
        );
      }
    } catch (error) {
      this.logger.error(`Form ${form.id}: the email couldn't be sent: ${String(error)}`);
    }
  }

  private async warnLimit(form: FormWithProject, limit: number, month: string): Promise<void> {
    try {
      if (!(await this.forms.claimOverLimit(form.id, month))) return;
      for (const owner of await this.cloud.ownerEmails(form.project.teamId)) {
        const locale = toApiLocale(owner.locale);
        await this.mail.send(
          cloudFormsLimitEmail({
            to: owner.email,
            locale,
            team: form.project.team.name,
            limit,
            url: `${this.config.cloudUrl}/${locale}/console/${form.project.team.slug}`,
            siteUrl: this.config.siteUrl,
          }),
        );
      }
    } catch (error) {
      this.logger.error(`Form ${form.id}: the limit email couldn't be sent: ${String(error)}`);
    }
  }
}
