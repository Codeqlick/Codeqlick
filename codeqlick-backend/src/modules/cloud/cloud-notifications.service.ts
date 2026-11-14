import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import type { CloudNotifyChannel, Prisma } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { SecretBox } from '../auth/secret-box.js';
import { MailService } from '../mail/mail.service.js';
import { safePost } from '../site-audits/safe-fetch.js';
import type { CloudCtx } from './cloud-caller.js';
import { cloudBuildEmail, cloudChannelOffEmail } from './cloud-emails.js';
import { CloudNotificationsRepository } from './cloud-notifications.repository.js';
import {
  channelUrlProblem,
  payload,
  signature,
  summary,
  testEvent,
  testFormEvent,
  urlHint,
  wants,
  wantsForm,
  type AnyNotifyEvent,
  type FormEvent,
  type NotifyEvent,
} from './cloud-notify.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import type { CreateChannelInput, UpdateChannelInput } from './cloud.schemas.js';

export interface ChannelView {
  id: string;
  name: string;
  kind: CloudNotifyChannel['kind'];
  enabled: boolean;
  /** Slack, Discord and webhooks: the URL's host and last 4 characters, never the URL. */
  hint: string | null;
  recipientIds: string[];
  buildFailed: boolean;
  buildSucceeded: boolean;
  previews: boolean;
  /** Slack, Discord and webhooks: the project's form submissions too (decision 63). */
  formSubmitted: boolean;
  /** Only these forms (empty: all). */
  formIds: string[];
  locale: ApiLocale;
  failures: number;
  lastSentAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
  createdAt: string;
}

/** Failed deliveries in a row that switch a channel off. */
const MAX_FAILURES = 10;

/** A stored form submission, as the forms service hands it over (decision 63). */
export interface StoredSubmission {
  form: {
    id: string;
    name: string;
    project: {
      id: string;
      slug: string;
      name: string;
      teamId: string;
      team: { slug: string };
    };
  };
  id: string;
  fields: Array<[string, string]>;
  email: string | null;
  page: string | null;
  createdAt: Date;
}

const NO_FORMS_BY_EMAIL =
  "Email notifications don't get form submissions: forms email their own recipients";

/** Build notifications (architecture 4.13 "Build notifications", decisions 43 and 63). */
@Injectable()
export class CloudNotificationsService {
  private readonly logger = new Logger(CloudNotificationsService.name);
  private readonly box: SecretBox;

  constructor(
    private readonly repository: CloudNotificationsRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {
    this.box = new SecretBox(config.credentialsSecret, 'cloud-notify-v1');
  }

  view(channel: CloudNotifyChannel): ChannelView {
    return {
      id: channel.id,
      name: channel.name,
      kind: channel.kind,
      enabled: channel.enabled,
      hint: channel.urlHint,
      recipientIds: channel.recipientIds,
      buildFailed: channel.buildFailed,
      buildSucceeded: channel.buildSucceeded,
      previews: channel.previews,
      formSubmitted: channel.formSubmitted,
      formIds: channel.formIds,
      locale: channel.locale === 'es' ? 'es' : 'en',
      failures: channel.failures,
      lastSentAt: channel.lastSentAt?.toISOString() ?? null,
      lastOk: channel.lastOk,
      lastError: channel.lastError,
      createdAt: channel.createdAt.toISOString(),
    };
  }

  // ── Managing channels ──────────────────────────────────────────────────────────────────────

  async list(ctx: CloudCtx, projectId: string): Promise<{ items: ChannelView[] }> {
    const { project } = await this.projects.project(ctx, projectId);
    return { items: (await this.repository.list(project.id)).map((c) => this.view(c)) };
  }

  async create(
    ctx: CloudCtx,
    projectId: string,
    input: CreateChannelInput,
  ): Promise<ChannelView & { secret?: string }> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const limit = CLOUD_PLANS[membership.team.plan].notifyChannelsPerProject;
    if ((await this.repository.count(project.id)) >= limit) {
      throw new ConflictException(`A project has at most ${limit} notifications`);
    }
    const data: Prisma.CloudNotifyChannelUncheckedCreateInput = {
      projectId: project.id,
      name: input.name,
      kind: input.kind,
      buildFailed: input.buildFailed ?? true,
      buildSucceeded: input.buildSucceeded ?? false,
      previews: input.previews ?? false,
      formSubmitted: input.formSubmitted ?? false,
      locale: input.locale ?? 'en',
    };
    let secret: string | undefined;
    if (input.kind === 'EMAIL' && (input.formSubmitted || (input.formIds?.length ?? 0) > 0)) {
      throw new BadRequestException(NO_FORMS_BY_EMAIL);
    }
    data.formIds = await this.checkForms(project.id, input.formIds ?? []);
    if (input.kind === 'EMAIL') {
      data.recipientIds = await this.checkRecipients(project.teamId, input.recipientIds);
    } else {
      Object.assign(data, this.sealUrl(input.kind, input.url));
      if (input.kind === 'WEBHOOK') {
        secret = `cqn_${randomBytes(16).toString('hex')}`;
        data.secretSealed = this.box.seal(secret);
      }
    }
    const channel = await this.repository.create(data);
    await this.teams.record(
      ctx,
      project.teamId,
      'notify.created',
      `${project.slug}: ${input.name}`,
    );
    return { ...this.view(channel), ...(secret ? { secret } : {}) };
  }

  async update(
    ctx: CloudCtx,
    projectId: string,
    channelId: string,
    input: UpdateChannelInput,
  ): Promise<ChannelView> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    const channel = await this.repository.find(project.id, channelId);
    if (!channel) throw new NotFoundException('Notification not found');
    const data: Prisma.CloudNotifyChannelUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.buildFailed !== undefined) data.buildFailed = input.buildFailed;
    if (input.buildSucceeded !== undefined) data.buildSucceeded = input.buildSucceeded;
    if (input.previews !== undefined) data.previews = input.previews;
    const formSubmitted = input.formSubmitted ?? channel.formSubmitted;
    const formIds = input.formIds ?? channel.formIds;
    if (channel.kind === 'EMAIL' && (formSubmitted || formIds.length > 0)) {
      throw new BadRequestException(NO_FORMS_BY_EMAIL);
    }
    if (input.formSubmitted !== undefined) data.formSubmitted = input.formSubmitted;
    if (input.formIds !== undefined)
      data.formIds = await this.checkForms(project.id, input.formIds);
    if (input.locale !== undefined) data.locale = input.locale;
    if (input.enabled !== undefined) {
      data.enabled = input.enabled;
      // Switching it back on starts the count of failures again.
      if (input.enabled) data.failures = 0;
    }
    if (input.url !== undefined) {
      if (channel.kind === 'EMAIL')
        throw new BadRequestException('An email notification has no URL');
      Object.assign(data, this.sealUrl(channel.kind, input.url));
    }
    if (input.recipientIds !== undefined) {
      if (channel.kind !== 'EMAIL') {
        throw new BadRequestException('Only email notifications have recipients');
      }
      data.recipientIds = await this.checkRecipients(project.teamId, input.recipientIds);
    }
    const updated = await this.repository.update(channel.id, data);
    await this.teams.record(
      ctx,
      project.teamId,
      'notify.updated',
      `${project.slug}: ${updated.name}`,
    );
    return this.view(updated);
  }

  async remove(ctx: CloudCtx, projectId: string, channelId: string): Promise<void> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    const channel = await this.repository.find(project.id, channelId);
    if (!channel || !(await this.repository.delete(project.id, channelId))) {
      throw new NotFoundException('Notification not found');
    }
    await this.teams.record(
      ctx,
      project.teamId,
      'notify.deleted',
      `${project.slug}: ${channel.name}`,
    );
  }

  /**
   * "Send a test": a sample event, at once, whether the channel is on or not: a build, or a form
   * submission for a Slack, Discord or webhook channel.
   */
  async test(
    ctx: CloudCtx,
    projectId: string,
    channelId: string,
    kind: 'build' | 'form' = 'build',
  ): Promise<{ ok: boolean; error: string | null }> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const channel = await this.repository.find(project.id, channelId);
    if (!channel) throw new NotFoundException('Notification not found');
    if (kind === 'form' && channel.kind === 'EMAIL') {
      throw new BadRequestException(NO_FORMS_BY_EMAIL);
    }
    const locale: ApiLocale = channel.locale === 'es' ? 'es' : 'en';
    const consoleUrl = `${this.config.cloudUrl}/${locale}/console/${membership.team.slug}/${project.slug}`;
    const sample = { slug: project.slug, name: project.name };
    const event =
      kind === 'form'
        ? testFormEvent(sample, `${consoleUrl}?tab=forms`, locale)
        : testEvent(sample, `${consoleUrl}?tab=notifications`);
    const error = await this.deliver(channel, event, project.teamId);
    const now = new Date();
    if (error) await this.repository.failed(channel.id, error, now);
    else await this.repository.succeeded(channel.id, now);
    return { ok: !error, error };
  }

  private sealUrl(kind: 'SLACK' | 'DISCORD' | 'WEBHOOK', url: string) {
    const problem = channelUrlProblem(kind, url);
    if (problem) throw new BadRequestException(problem);
    return { urlSealed: this.box.seal(url), urlHint: urlHint(url) };
  }

  /** Forms a channel is limited to: forms of the project, each once. */
  private async checkForms(projectId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return unique;
    if ((await this.repository.formsAmong(projectId, unique)).length !== unique.length) {
      throw new BadRequestException('Notifications can only follow forms of the project');
    }
    return unique;
  }

  private async checkRecipients(teamId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if ((await this.repository.membersAmong(teamId, unique)).length !== unique.length) {
      throw new BadRequestException('Notifications go to members of the team');
    }
    return unique;
  }

  // ── Delivering ─────────────────────────────────────────────────────────────────────────────

  /**
   * Tells a project's channels that a build ended. Called in the background by the builds
   * service; never throws.
   */
  async buildEnded(buildId: string, deploymentUrl?: string): Promise<void> {
    try {
      const build = await this.repository.build(buildId);
      if (!build || (build.status !== 'SUCCEEDED' && build.status !== 'FAILED')) return;
      const target = build.target === 'PRODUCTION' ? 'production' : 'preview';
      const name = build.status === 'FAILED' ? 'build.failed' : 'build.succeeded';
      const channels = (await this.repository.list(build.project.id)).filter((c) =>
        wants(c, name, target),
      );
      if (channels.length === 0) return;
      for (const channel of channels) {
        const locale: ApiLocale = channel.locale === 'es' ? 'es' : 'en';
        const event: NotifyEvent = {
          event: name,
          project: { slug: build.project.slug, name: build.project.name },
          build: {
            number: build.number,
            target,
            branch: build.branch,
            commit: build.commit,
            commitMessage: build.commitMessage,
            author: build.author,
            pullRequest: build.pullRequest,
            status: build.status,
            error: build.error,
            durationMs:
              build.startedAt && build.finishedAt
                ? build.finishedAt.getTime() - build.startedAt.getTime()
                : null,
            url: `${this.config.cloudUrl}/${locale}/console/${build.project.team.slug}/${build.project.slug}/builds/${build.number}`,
          },
          deployment: deploymentUrl ? { url: deploymentUrl } : null,
          sentAt: new Date().toISOString(),
        };
        const error = await this.deliver(channel, event, build.project.teamId);
        await this.recordDelivery(channel, error, build.project);
      }
    } catch (error) {
      this.logger.error(`Build ${buildId}: notifications failed: ${String(error)}`);
    }
  }

  /**
   * Tells a project's Slack, Discord and webhook channels about a stored form submission
   * (decision 63). Called in the background by the forms service; never throws.
   */
  async formSubmitted(submission: StoredSubmission): Promise<void> {
    const { form } = submission;
    try {
      const channels = (await this.repository.list(form.project.id)).filter((c) =>
        wantsForm(c, form.id),
      );
      for (const channel of channels) {
        const locale: ApiLocale = channel.locale === 'es' ? 'es' : 'en';
        const event: FormEvent = {
          event: 'form.submitted',
          project: { slug: form.project.slug, name: form.project.name },
          form: { id: form.id, name: form.name },
          submission: {
            id: submission.id,
            fields: submission.fields,
            email: submission.email,
            page: submission.page,
            createdAt: submission.createdAt.toISOString(),
            // The console has no page per submission: its form's list, newest first.
            url: `${this.config.cloudUrl}/${locale}/console/${form.project.team.slug}/${form.project.slug}?tab=forms&form=${form.id}`,
          },
          sentAt: new Date().toISOString(),
        };
        const error = await this.deliver(channel, event, form.project.teamId);
        await this.recordDelivery(channel, error, form.project);
      }
    } catch (error) {
      this.logger.error(`Form ${form.id}: notifications failed: ${String(error)}`);
    }
  }

  private async recordDelivery(
    channel: CloudNotifyChannel,
    error: string | null,
    project: { slug: string; name: string; teamId: string; team: { slug: string } },
  ): Promise<void> {
    const now = new Date();
    if (!error) {
      await this.repository.succeeded(channel.id, now);
      return;
    }
    const failures = await this.repository.failed(channel.id, error, now);
    if (failures < MAX_FAILURES || !(await this.repository.switchOff(channel.id))) return;
    await this.teams.recordSystem(
      project.teamId,
      'Codeqlick Cloud',
      'notify.switched_off',
      `${project.slug}: ${channel.name}`,
    );
    for (const admin of await this.repository.admins(project.teamId)) {
      const locale = toApiLocale(admin.locale);
      await this.mail
        .send(
          cloudChannelOffEmail({
            to: admin.email,
            locale,
            channel: channel.name,
            project: project.name,
            error,
            url: `${this.config.cloudUrl}/${locale}/console/${project.team.slug}/${project.slug}?tab=notifications`,
            siteUrl: this.config.siteUrl,
          }),
        )
        .catch((e: unknown) => this.logger.warn(`Channel ${channel.id}: ${String(e)}`));
    }
  }

  /** Sends one event to one channel; the error, or null when it was delivered. */
  private async deliver(
    channel: CloudNotifyChannel,
    event: AnyNotifyEvent,
    teamId: string,
  ): Promise<string | null> {
    const locale: ApiLocale = channel.locale === 'es' ? 'es' : 'en';
    if (channel.kind === 'EMAIL') {
      if ('submission' in event) return NO_FORMS_BY_EMAIL;
      const people = await this.repository.recipients(teamId, channel.recipientIds);
      if (people.length === 0) return 'None of its people is in the team any more';
      try {
        for (const person of people) {
          const personLocale = toApiLocale(person.locale);
          await this.mail.send(
            cloudBuildEmail({
              to: person.email,
              locale: personLocale,
              summary: summary(event, personLocale),
              failed: event.event === 'build.failed',
              test: event.event === 'test',
              project: event.project.name,
              error: event.build.error,
              buildUrl: event.build.url.replace(
                /\/(en|es)\/console\//,
                `/${personLocale}/console/`,
              ),
              siteUrl: this.config.siteUrl,
            }),
          );
        }
        return null;
      } catch (error) {
        return `The email couldn't be sent: ${String(error)}`.slice(0, 300);
      }
    }
    if (!channel.urlSealed) return 'No address';
    let url: string;
    try {
      url = this.box.open(channel.urlSealed);
    } catch {
      return 'The address could not be read: enter it again';
    }
    const body = payload(channel.kind, event, locale);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Codeqlick-Cloud/1.0 (+https://cloud.codeqlick.com)',
    };
    if (channel.kind === 'WEBHOOK') {
      headers['X-Codeqlick-Event'] = event.event;
      if (channel.secretSealed) {
        headers['X-Codeqlick-Signature'] = signature(this.box.open(channel.secretSealed), body);
      }
    }
    try {
      const response = await safePost(url, body, headers);
      if (response.status >= 200 && response.status < 300) return null;
      const detail = response.body.replace(/\s+/g, ' ').trim().slice(0, 120);
      return `HTTP ${response.status}${detail ? `: ${detail}` : ''}`.slice(0, 300);
    } catch (error) {
      return (error instanceof Error ? error.message : String(error)).slice(0, 300);
    }
  }
}
