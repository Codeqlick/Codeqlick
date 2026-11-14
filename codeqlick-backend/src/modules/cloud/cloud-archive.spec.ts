import { HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import type { CloudDiskService } from './cloud-disk.service.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import type { CloudTeamsService } from './cloud-teams.service.js';
import type { CloudTokensService } from './cloud-tokens.service.js';
import type { CloudRepository } from './cloud.repository.js';
import type { CloudStorage } from './cloud.storage.js';

const ctx = {
  user: { id: 'u1', email: 'ada@codeqlick.test', name: 'Ada', role: 'CLIENT' },
  ip: '127.0.0.1',
} as unknown as CloudCtx;

const project = {
  id: 'p1',
  teamId: 't1',
  slug: 'docs',
  productionDeploymentId: 'd1',
  suspendedAt: null as Date | null,
};

describe('CloudProjectsService.archive', () => {
  let repository: {
    findProject: ReturnType<typeof vi.fn>;
    findDeployment: ReturnType<typeof vi.fn>;
    countEventsSince: ReturnType<typeof vi.fn>;
  };
  let teams: { accessById: ReturnType<typeof vi.fn>; record: ReturnType<typeof vi.fn> };
  let storage: { hosting: ReturnType<typeof vi.fn>; archive: ReturnType<typeof vi.fn> };
  let service: CloudProjectsService;

  beforeEach(() => {
    repository = {
      findProject: vi.fn().mockResolvedValue({ ...project }),
      findDeployment: vi.fn().mockResolvedValue({ id: 'd1', shortId: 'a1b2c3d4' }),
      countEventsSince: vi.fn().mockResolvedValue(0),
    };
    teams = {
      accessById: vi.fn().mockResolvedValue({ teamId: 't1', team: { plan: 'FREE' } }),
      record: vi.fn().mockResolvedValue(undefined),
    };
    storage = {
      hosting: vi.fn().mockReturnValue({ domain: 'cloud.test', root: '/srv/cloud' }),
      archive: vi.fn().mockResolvedValue(Readable.from([Buffer.from('tgz')])),
    };
    service = new CloudProjectsService(
      repository as unknown as CloudRepository,
      teams as unknown as CloudTeamsService,
      {} as CloudTokensService,
      storage as unknown as CloudStorage,
      {} as AppConfigService,
      {} as CloudDiskService,
    );
  });

  it('streams the folder as <slug>-<short id>.tar.gz and records the download', async () => {
    const result = await service.archive(ctx, 'p1', 'd1');

    expect(result.filename).toBe('docs-a1b2c3d4.tar.gz');
    expect(result.stream).toBeInstanceOf(Readable);
    expect(teams.accessById).toHaveBeenCalledWith(ctx, 't1', 'MEMBER');
    expect(storage.archive).toHaveBeenCalledWith('d1');
    expect(teams.record).toHaveBeenCalledWith(ctx, 't1', 'deployment.downloaded', 'docs--a1b2c3d4');
    // Recorded only once the archive's first bytes were ready.
    expect(storage.archive.mock.invocationCallOrder[0]!).toBeLessThan(
      teams.record.mock.invocationCallOrder[0]!,
    );
    expect(repository.countEventsSince).toHaveBeenCalledWith(
      't1',
      'deployment.downloaded',
      expect.any(Date),
    );
  });

  it('allows downloading while the project is suspended', async () => {
    repository.findProject.mockResolvedValue({ ...project, suspendedAt: new Date() });

    await expect(service.archive(ctx, 'p1', 'd1')).resolves.toMatchObject({
      filename: 'docs-a1b2c3d4.tar.gz',
    });
  });

  it('refuses the 11th download of the hour with 429, recording nothing', async () => {
    repository.countEventsSince.mockResolvedValue(10);

    const error = await service.archive(ctx, 'p1', 'd1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(storage.archive).not.toHaveBeenCalled();
    expect(teams.record).not.toHaveBeenCalled();
  });

  it('answers 404 for a deleted deployment or one whose folder is gone', async () => {
    repository.findDeployment.mockResolvedValueOnce(null);
    await expect(service.archive(ctx, 'p1', 'd9')).rejects.toBeInstanceOf(NotFoundException);

    storage.archive.mockResolvedValueOnce(null);
    await expect(service.archive(ctx, 'p1', 'd1')).rejects.toBeInstanceOf(NotFoundException);
    expect(teams.record).not.toHaveBeenCalled();
  });

  it("doesn't count an attempt whose packing fails before the first bytes", async () => {
    storage.archive.mockRejectedValueOnce(new Error('EACCES: permission denied'));

    await expect(service.archive(ctx, 'p1', 'd1')).rejects.toThrow(/EACCES/);
    expect(teams.record).not.toHaveBeenCalled();
  });

  it('answers 503 while hosting is not set up', async () => {
    storage.hosting.mockImplementation(() => {
      throw new ServiceUnavailableException('Cloud hosting is not set up yet');
    });

    await expect(service.archive(ctx, 'p1', 'd1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(storage.archive).not.toHaveBeenCalled();
  });
});
