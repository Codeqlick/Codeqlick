import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { SecretBox } from '../auth/secret-box.js';
import { renderEmail } from '../mail/email-layout.js';
import { MailService } from '../mail/mail.service.js';
import { CredentialsRepository, type CredentialRow } from './credentials.repository.js';
import type { CreateCredentialInput } from './credentials.schemas.js';

/** What both sides see in the list: never the secret. */
export interface CredentialView {
  id: string;
  label: string;
  url: string | null;
  username: string | null;
  createdBy: { name: string };
  createdAt: string;
  /** When the team last opened it. */
  viewedAt: string | null;
}

function toView(row: CredentialRow): CredentialView {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    username: row.username,
    createdBy: { name: row.createdBy?.name ?? 'Codeqlick' },
    createdAt: row.createdAt.toISOString(),
    viewedAt: row.viewedAt?.toISOString() ?? null,
  };
}

/**
 * Access the client shares for a project (hosting, domain, service accounts) instead of sending it
 * by email: sealed with AES-256-GCM before it reaches the database. Clients add and delete theirs
 * but don't read them back; the team reveals one at a time, and every reveal is logged and shown
 * to the client.
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);
  private readonly box: SecretBox;

  constructor(
    private readonly repository: CredentialsRepository,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {
    this.box = new SecretBox(config.credentialsSecret, 'project-credentials-v1');
  }

  async list(caller: AuthUser, projectId: string): Promise<CredentialView[]> {
    await this.project(caller, projectId);
    return (await this.repository.list(projectId)).map(toView);
  }

  async create(
    caller: AuthUser,
    projectId: string,
    input: CreateCredentialInput,
  ): Promise<CredentialView> {
    const project = await this.project(caller, projectId);
    const row = await this.repository.create({
      projectId,
      createdById: caller.id,
      label: input.label,
      url: input.url || null,
      username: input.username || null,
      secret: this.box.seal(input.secret),
      notes: input.notes ? this.box.seal(input.notes) : null,
    });
    await this.activity.record(caller, {
      action: 'project.credential_added',
      targetId: projectId,
      targetLabel: project.name,
      details: { label: row.label },
    });
    if (caller.role === 'CLIENT') {
      // Never the secret, just that there is one to look at.
      this.mail
        .send({
          to: this.config.leadsNotifyTo,
          replyTo: caller.email,
          subject: `${project.name}: ${caller.name} shared access (${row.label})`,
          ...renderEmail(
            {
              locale: 'en',
              preheader: `${caller.name} shared "${row.label}".`,
              title: 'New access shared',
              intro: [
                `${caller.name} shared "${row.label}" for ${project.name}. It is encrypted; open it from the project page when you need it.`,
              ],
              button: {
                label: 'Open the project',
                url: `${this.config.siteUrl}/es/admin/projects/${project.id}#access`,
              },
              signoff: [],
            },
            this.config.siteUrl,
          ),
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Access notification failed: ${reason}`);
        });
    }
    return toView(row);
  }

  /** The team reads one: logged, and the client sees when. */
  async reveal(
    actor: AuthUser,
    projectId: string,
    credentialId: string,
  ): Promise<{ secret: string; notes: string | null }> {
    const project = await this.project(actor, projectId);
    const row = await this.repository.find(projectId, credentialId);
    if (!row) throw new NotFoundException('Access not found');
    await this.repository.markViewed(row.id);
    await this.activity.record(actor, {
      action: 'project.credential_viewed',
      targetId: projectId,
      targetLabel: project.name,
      details: { label: row.label },
    });
    return {
      secret: this.box.open(row.secret),
      notes: row.notes ? this.box.open(row.notes) : null,
    };
  }

  async remove(caller: AuthUser, projectId: string, credentialId: string): Promise<void> {
    const project = await this.project(caller, projectId);
    const row = await this.repository.find(projectId, credentialId);
    if (!row) throw new NotFoundException('Access not found');
    await this.repository.delete(row.id);
    await this.activity.record(caller, {
      action: 'project.credential_deleted',
      targetId: projectId,
      targetLabel: project.name,
      details: { label: row.label },
    });
  }

  /** "When we're done": every access of the project goes. */
  async removeAll(actor: AuthUser, projectId: string): Promise<{ deleted: number }> {
    const project = await this.project(actor, projectId);
    const deleted = await this.repository.deleteAll(projectId);
    await this.activity.record(actor, {
      action: 'project.credential_deleted',
      targetId: projectId,
      targetLabel: project.name,
      details: { all: true, count: deleted },
    });
    return { deleted };
  }

  private async project(caller: AuthUser, projectId: string) {
    const project = await this.repository.findProject(projectId);
    if (!project || (caller.role !== 'ADMIN' && project.clientId !== accountOf(caller))) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }
}
