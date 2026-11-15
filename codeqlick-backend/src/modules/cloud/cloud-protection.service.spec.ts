import { createHash } from 'node:crypto';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import type { CloudProjectsService } from './cloud-projects.service.js';
import type { CloudProtectionRepository, ProtectedProject } from './cloud-protection.repository.js';
import { CloudProtectionService, type ProxyHeaders } from './cloud-protection.service.js';
import type { CloudRulesService } from './cloud-rules.service.js';
import type { CloudStorage } from './cloud.storage.js';
import type { CloudTeamsService } from './cloud-teams.service.js';

const KEY = 'ab'.repeat(32);
const TOKEN = 'cqb_' + 'A'.repeat(43);
const HASH = createHash('sha256').update(TOKEN).digest('hex');
const now = Date.UTC(2026, 10, 14, 12, 0, 0);
const ctx = { user: { id: 'u1', name: 'Ada', email: 'a@x.test' }, ip: '1.2.3.4' } as CloudCtx;

function project(overrides: Partial<ProtectedProject> = {}): ProtectedProject {
  return {
    id: 'p1',
    slug: 'docs',
    name: 'Docs',
    protection: 'ALL',
    protectionHash: '$argon2id$x',
    protectionDays: 7,
    protectionVersion: 1,
    suspendedAt: null,
    protectionUpdatedAt: null,
    protectionBypassHash: HASH,
    protectionBypassPrefix: TOKEN.slice(0, 12),
    protectionBypassCreatedAt: new Date(now - 1000),
    protectionBypassCreatedBy: { id: 'u1', name: 'Ada' },
    protectionBypassLastUsedAt: null,
    ...overrides,
  };
}

const headers = (overrides: Partial<ProxyHeaders> = {}): ProxyHeaders => ({
  key: KEY,
  host: 'docs.cloud.test',
  slug: 'docs',
  kind: 'production',
  ip: '203.0.113.5',
  ...overrides,
});

describe('CloudProtectionService bypass', () => {
  let found: ProtectedProject | null;
  let access: { project: ProtectedProject & { teamId: string } };
  let key: string | undefined;
  const repository = {
    findBySlug: vi.fn(() => Promise.resolve(found)),
    findById: vi.fn(() => Promise.resolve(found)),
    setBypass: vi.fn(() => Promise.resolve(found)),
    clearBypass: vi.fn(() => Promise.resolve()),
    touchBypass: vi.fn(() => Promise.resolve()),
  };
  const projects = { project: vi.fn(() => Promise.resolve(access)) };
  const teams = { record: vi.fn(() => Promise.resolve()) };
  let service: CloudProtectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    found = project();
    access = { project: { ...project(), teamId: 't1' } };
    key = KEY;
    service = new CloudProtectionService(
      repository as unknown as CloudProtectionRepository,
      projects as unknown as CloudProjectsService,
      teams as unknown as CloudTeamsService,
      {} as CloudStorage,
      {
        credentialsSecret: 'a-test-secret-a-test-secret-a-test-secret',
        get cloudProtectionKey() {
          return key;
        },
      } as unknown as AppConfigService,
      {} as CloudRulesService,
    );
  });

  it('lets the right token through and refuses none, a wrong or an oversized one', async () => {
    expect(await service.check(headers(), now)).toBe(false);
    expect(await service.check(headers({ bypass: TOKEN }), now)).toBe(true);
    expect(await service.check(headers({ bypass: `${TOKEN}x` }), now)).toBe(false);
    expect(await service.check(headers({ bypass: 'x'.repeat(201) }), now)).toBe(false);
    expect(await service.check(headers({ bypass: '' }), now)).toBe(false);
  });

  it('does nothing while the project has no token, protection is off or the key is wrong', async () => {
    found = project({ protectionBypassHash: null, protectionBypassPrefix: null });
    expect(await service.check(headers({ bypass: TOKEN }), now)).toBe(false);
    found = project({ protection: 'OFF', protectionHash: null });
    expect(await service.check(headers(), now)).toBe(true);
    found = project({ protection: 'PREVIEWS' });
    expect(await service.check(headers({ bypass: TOKEN }), now)).toBe(true);
    await expect(
      service.check(headers({ key: 'cd'.repeat(32), bypass: TOKEN }), now),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses wrong tokens after 10 from an IP, yet the right token still passes', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect(await service.check(headers({ bypass: `cqb_wrong${i}` }), now)).toBe(false);
    }
    expect(await service.check(headers({ bypass: 'cqb_wrong-again' }), now)).toBe(false);
    // A correct token from the limited IP passes (and so from any other IP).
    expect(await service.check(headers({ bypass: TOKEN }), now)).toBe(true);
    expect(await service.check(headers({ bypass: TOKEN, ip: '203.0.113.6' }), now)).toBe(true);
    // The minute is over: wrong tokens count again, the right one still works.
    expect(await service.check(headers({ bypass: TOKEN }), now + 60_000)).toBe(true);
  });

  it('writes the last use at most once a minute', async () => {
    await service.check(headers({ bypass: TOKEN }), now);
    await service.check(headers({ bypass: TOKEN }), now + 30_000);
    expect(repository.touchBypass).toHaveBeenCalledTimes(1);
    expect(repository.touchBypass).toHaveBeenCalledWith('p1', HASH, new Date(now));
    await service.check(headers({ bypass: TOKEN }), now + 61_000);
    expect(repository.touchBypass).toHaveBeenCalledTimes(2);
    // A stored value younger than a minute is respected too (another instance wrote it).
    vi.clearAllMocks();
    found = project({ protectionBypassLastUsedAt: new Date(now + 100_000 - 10_000) });
    const fresh = new Date(now + 100_000);
    await service.check(headers({ bypass: TOKEN, ip: '203.0.113.9' }), fresh.getTime());
    expect(repository.touchBypass).not.toHaveBeenCalled();
  });

  it('a failed stamp never fails the request', async () => {
    repository.touchBypass.mockRejectedValueOnce(new Error('db down'));
    expect(await service.check(headers({ bypass: TOKEN }), now)).toBe(true);
  });

  it('creates a token, stores only its hash and records an event without it', async () => {
    const created = await service.createBypass(ctx, 'p1');
    expect(created.token).toMatch(/^cqb_[\w-]{43}$/);
    expect(created.prefix).toBe(created.token.slice(0, 12));
    const stored = repository.setBypass.mock.calls[0] as unknown as [
      string,
      { hash: string; prefix: string; createdById: string },
    ];
    expect(stored[1]).toMatchObject({
      hash: createHash('sha256').update(created.token).digest('hex'),
      prefix: created.prefix,
      createdById: 'u1',
    });
    expect(teams.record).toHaveBeenCalledWith(
      ctx,
      't1',
      'project.protection_bypass_created',
      'docs',
      { replaced: true },
    );
    expect(JSON.stringify(teams.record.mock.calls)).not.toContain(created.token);
    expect(projects.project).toHaveBeenCalledWith(ctx, 'p1', 'ADMIN');
  });

  it('refuses creating on a suspended project or without the key, but allows revoking', async () => {
    access = { project: { ...project({ suspendedAt: new Date(now) }), teamId: 't1' } };
    await expect(service.createBypass(ctx, 'p1')).rejects.toThrow('This project is suspended');
    await service.revokeBypass(ctx, 'p1');
    expect(repository.clearBypass).toHaveBeenCalledWith('p1');
    access = { project: { ...project(), teamId: 't1' } };
    key = undefined;
    await expect(service.createBypass(ctx, 'p1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.setBypass).not.toHaveBeenCalled();
  });

  it('revoking when there is none changes and records nothing', async () => {
    access = { project: { ...project({ protectionBypassHash: null }), teamId: 't1' } };
    await service.revokeBypass(ctx, 'p1');
    expect(repository.clearBypass).not.toHaveBeenCalled();
    expect(teams.record).not.toHaveBeenCalled();
  });

  it('shows the token as its prefix, creator and use, never the hash', async () => {
    const view = await service.get(ctx, 'p1');
    expect(view.bypass).toEqual({
      prefix: TOKEN.slice(0, 12),
      createdAt: new Date(now - 1000).toISOString(),
      createdBy: { id: 'u1', name: 'Ada' },
      lastUsedAt: null,
    });
    expect(JSON.stringify(view)).not.toContain(HASH);
    found = project({ protectionBypassHash: null, protectionBypassPrefix: null });
    expect((await service.get(ctx, 'p1')).bypass).toBeNull();
  });
});
