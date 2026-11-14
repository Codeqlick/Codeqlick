import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import type { CloudRepository } from './cloud.repository.js';
import type { CloudTokensRepository } from './cloud-tokens.repository.js';
import { CloudTokensService, sha256 } from './cloud-tokens.service.js';

const ctx: CloudCtx = {
  user: { id: 'user-1', email: 'dev@example.com', name: 'Dev', role: 'CLIENT' },
  ip: '203.0.113.7',
};

function setup() {
  const created = vi.fn(async (data: Record<string, unknown>) => ({
    id: 'token-1',
    userId: data.userId,
    teamId: data.teamId ?? null,
    name: data.name,
    prefix: data.prefix,
    tokenHash: data.tokenHash,
    readOnly: data.readOnly ?? false,
    expiresAt: data.expiresAt ?? null,
    lastUsedAt: null,
    lastUsedIp: null,
    createdAt: new Date('2026-11-14T10:00:00Z'),
    team: data.teamId ? { slug: 'acme', name: 'Acme' } : null,
  }));
  const tokens = {
    count: vi.fn(async () => 0),
    create: created,
    findByHash: vi.fn(),
    touch: vi.fn(async () => undefined),
    findDeviceByHash: vi.fn(),
    consume: vi.fn(async () => true),
  };
  const cloud = {
    membership: vi.fn(async () => ({ teamId: 'team-1' })),
    activeUser: vi.fn(async () => ({ id: 'user-1', name: 'Dev', email: 'dev@example.com' })),
    event: vi.fn(async () => undefined),
  };
  const service = new CloudTokensService(
    tokens as unknown as CloudTokensRepository,
    cloud as unknown as CloudRepository,
    { cloudUrl: 'https://cloud.codeqlick.com' } as unknown as AppConfigService,
  );
  return { service, tokens, cloud };
}

describe('CloudTokensService access level', () => {
  it('makes a full token when readOnly is left out', async () => {
    const { service, tokens } = setup();
    const { token, item } = await service.create(ctx, {
      name: 'CI',
      expiresInDays: 90,
    } as Parameters<CloudTokensService['create']>[1]);
    expect(token).toMatch(/^cqk_/);
    expect(tokens.create).toHaveBeenCalledWith(expect.objectContaining({ readOnly: false }));
    expect(item.readOnly).toBe(false);
  });

  it('makes a read-only token when asked', async () => {
    const { service, tokens } = setup();
    const { item } = await service.create(ctx, {
      name: 'Dashboard',
      expiresInDays: null,
      readOnly: true,
    });
    expect(tokens.create).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
    expect(item).toMatchObject({ name: 'Dashboard', readOnly: true, expiresAt: null });
  });

  it('records readOnly in the token.created event of the team it is restricted to', async () => {
    const { service, cloud } = setup();
    await service.create(ctx, {
      name: 'Reader',
      teamSlug: 'acme',
      expiresInDays: 30,
      readOnly: true,
    });
    expect(cloud.event).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        actorId: 'user-1',
        action: 'token.created',
        targetLabel: 'Reader',
        details: { readOnly: true },
        ip: '203.0.113.7',
      }),
    );
  });

  it('hands the CLI a full token after a device sign-in', async () => {
    const { service, tokens } = setup();
    tokens.findDeviceByHash.mockResolvedValue({
      id: 'device-1',
      userId: 'user-1',
      clientName: 'laptop',
      approvedAt: new Date(),
      deniedAt: null,
      consumedAt: null,
      lastPolledAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await service.poll('device-code');
    expect(result.status).toBe('approved');
    expect(tokens.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'CLI · laptop', readOnly: false }),
    );
  });

  it.each([true, false])('puts readOnly=%s on the resolved caller', async (readOnly) => {
    const { service, tokens } = setup();
    const token = `cqk_${'b'.repeat(43)}`;
    tokens.findByHash.mockResolvedValue({
      id: 'token-1',
      teamId: null,
      name: 'CI',
      readOnly,
      expiresAt: null,
      lastUsedAt: new Date(),
      tokenHash: sha256(token),
      user: {
        id: 'user-1',
        email: 'dev@example.com',
        name: 'Dev',
        role: 'CLIENT',
        isActive: true,
        registeredAt: new Date(),
      },
    });
    const user = await service.resolve(token, '203.0.113.7');
    expect(user?.token).toEqual({ id: 'token-1', name: 'CI', teamId: null, readOnly });
  });
});
