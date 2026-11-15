import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { CloudAuditsService } from './cloud-audits.service.js';
import type { CloudBuildsRepository } from './cloud-builds.repository.js';
import { CloudBuildsService } from './cloud-builds.service.js';
import type { CloudCtx } from './cloud-caller.js';
import type { CloudDiskService } from './cloud-disk.service.js';
import type { CloudNotificationsService } from './cloud-notifications.service.js';
import type { CloudProjectsService } from './cloud-projects.service.js';
import type { CloudTeamsService } from './cloud-teams.service.js';
import type { GithubClient } from './github.client.js';

const ctx = {} as CloudCtx;
const PROJECT = '11111111-1111-4111-8111-111111111111';

function setup(log: { log: string } | null) {
  const findBuildLog = vi.fn(() => Promise.resolve(log));
  const project = vi.fn(() => Promise.resolve({ project: { id: PROJECT, slug: 'docs' } }));
  const service = new CloudBuildsService(
    { findBuildLog } as unknown as CloudBuildsRepository,
    { project } as unknown as CloudProjectsService,
    {} as CloudTeamsService,
    {} as GithubClient,
    {
      credentialsSecret: 'credentials-secret-for-unit-tests-0123456789',
      jwtAccessSecret: 'jwt-access-secret-for-unit-tests-0123456789',
    } as unknown as AppConfigService,
    {} as CloudNotificationsService,
    {} as CloudDiskService,
    {} as CloudAuditsService,
    {} as MailService,
  );
  return { service, findBuildLog, project };
}

describe('CloudBuildsService.logFile', () => {
  it('gives the whole log under the project and build number', async () => {
    const { service, findBuildLog, project } = setup({ log: 'npm ci\nbuilt\n' });
    await expect(service.logFile(ctx, PROJECT, 12)).resolves.toEqual({
      filename: 'docs-build-12.log',
      text: 'npm ci\nbuilt\n',
    });
    // Any member may read it: the plain member check, nothing stricter.
    expect(project).toHaveBeenCalledWith(ctx, PROJECT);
    expect(findBuildLog).toHaveBeenCalledWith(PROJECT, 12);
  });

  it('answers 404 for a build that does not exist', async () => {
    const { service } = setup(null);
    await expect(service.logFile(ctx, PROJECT, 99)).rejects.toThrow(NotFoundException);
    await expect(service.logFile(ctx, PROJECT, 99)).rejects.toThrow('Build not found');
  });

  it('answers an empty file once the log was cleared', async () => {
    const { service } = setup({ log: '' });
    await expect(service.logFile(ctx, PROJECT, 3)).resolves.toEqual({
      filename: 'docs-build-3.log',
      text: '',
    });
  });
});
