import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { CloudCtx, CloudRoleName } from './cloud-caller.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import type { CloudRepository } from './cloud.repository.js';
import type { CloudStorage } from './cloud.storage.js';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const BLOCKED = 'This team requires two-step verification';

function team(requireTwoFactor: boolean, name = 'Ada Labs') {
  return {
    id: TEAM_ID,
    slug: 'ada-labs',
    name,
    plan: 'FREE' as const,
    requireTwoFactor,
    createdAt: new Date('2026-11-01T10:00:00Z'),
  };
}

function membership(role: CloudRoleName, requireTwoFactor: boolean, hasTwoFactor: boolean) {
  return {
    id: 'm1',
    teamId: TEAM_ID,
    userId: 'u1',
    role,
    team: team(requireTwoFactor),
    user: { totpEnabledAt: hasTwoFactor ? new Date('2026-10-01T10:00:00Z') : null },
  };
}

function ctx(tokenTeamId?: string): CloudCtx {
  return {
    user: {
      id: 'u1',
      email: 'ada@codeqlick.test',
      name: 'Ada',
      role: 'CLIENT',
      ...(tokenTeamId
        ? { via: 'token' as const, token: { id: 't1', name: 'CI', teamId: tokenTeamId } }
        : {}),
    },
    ip: '127.0.0.1',
  };
}

function service(row: ReturnType<typeof membership> | null) {
  const repository = {
    membership: vi.fn().mockResolvedValue(row),
    membershipByTeamId: vi.fn().mockResolvedValue(row),
    updateTeam: vi.fn((_id: string, data: { name?: string; requireTwoFactor?: boolean }) =>
      Promise.resolve({
        ...team(data.requireTwoFactor ?? row?.team.requireTwoFactor ?? false, data.name),
      }),
    ),
    event: vi.fn().mockResolvedValue(undefined),
    countOwners: vi.fn().mockResolvedValue(2),
    removeMember: vi.fn().mockResolvedValue(undefined),
  };
  const svc = new CloudTeamsService(
    repository as unknown as CloudRepository,
    {} as CloudStorage,
    {} as MailService,
    {} as AppConfigService,
  );
  return { svc, repository };
}

describe('CloudTeamsService: requiring two-step verification', () => {
  it('refuses a member without it while the team requires it, by slug and by id', async () => {
    const { svc } = service(membership('OWNER', true, false));
    await expect(svc.access(ctx(), 'ada-labs')).rejects.toMatchObject({
      status: 403,
      message: BLOCKED,
    });
    await expect(svc.accessById(ctx(), TEAM_ID)).rejects.toMatchObject({
      status: 403,
      message: BLOCKED,
    });
  });

  it('lets in a member who has it, and anyone when the team does not require it', async () => {
    await expect(
      service(membership('MEMBER', true, true)).svc.access(ctx(), 'ada-labs'),
    ).resolves.toMatchObject({ teamId: TEAM_ID });
    await expect(
      service(membership('MEMBER', false, false)).svc.access(ctx(), 'ada-labs'),
    ).resolves.toMatchObject({ teamId: TEAM_ID });
  });

  it('applies to API tokens too, after the token restriction (404 first)', async () => {
    const { svc } = service(membership('MEMBER', true, false));
    await expect(svc.access(ctx(TEAM_ID), 'ada-labs')).rejects.toMatchObject({ status: 403 });
    await expect(svc.access(ctx('another-team'), 'ada-labs')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('checks it before the role', async () => {
    const { svc } = service(membership('MEMBER', true, false));
    await expect(svc.access(ctx(), 'ada-labs', 'OWNER')).rejects.toMatchObject({
      message: BLOCKED,
    });
  });

  it('opens the team view and leaving the team to a blocked member', async () => {
    const { svc, repository } = service(membership('MEMBER', true, false));
    await expect(
      svc.access(ctx(), 'ada-labs', 'MEMBER', { allowWithoutTwoFactor: true }),
    ).resolves.toMatchObject({ teamId: TEAM_ID });
    await expect(svc.getTeam(ctx(), 'ada-labs')).resolves.toMatchObject({
      requireTwoFactor: true,
      twoFactorBlocked: true,
    });
    await expect(svc.members(ctx(), 'ada-labs')).rejects.toMatchObject({ status: 403 });
    await svc.removeMember(ctx(), 'ada-labs', 'u1');
    expect(repository.removeMember).toHaveBeenCalledWith(TEAM_ID, 'u1');
  });

  it('lets only owners turn it on', async () => {
    const { svc, repository } = service(membership('ADMIN', false, true));
    await expect(
      svc.updateTeam(ctx(), 'ada-labs', { requireTwoFactor: true }),
    ).rejects.toMatchObject({ status: 403 });
    expect(repository.updateTeam).not.toHaveBeenCalled();
    // An admin still renames it.
    await expect(svc.updateTeam(ctx(), 'ada-labs', { name: 'Grace Labs' })).resolves.toMatchObject({
      name: 'Grace Labs',
      requireTwoFactor: false,
    });
  });

  it("refuses to turn it on without it on the owner's own account", async () => {
    const { svc, repository } = service(membership('OWNER', false, false));
    await expect(
      svc.updateTeam(ctx(), 'ada-labs', { requireTwoFactor: true }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Turn on two-step verification on your own account first',
    });
    expect(repository.updateTeam).not.toHaveBeenCalled();
  });

  it('turns it on, recording the change', async () => {
    const { svc, repository } = service(membership('OWNER', false, true));
    await expect(
      svc.updateTeam(ctx(), 'ada-labs', { requireTwoFactor: true }),
    ).resolves.toMatchObject({ requireTwoFactor: true, twoFactorBlocked: false });
    expect(repository.updateTeam).toHaveBeenCalledWith(TEAM_ID, { requireTwoFactor: true });
    expect(repository.event).toHaveBeenCalledTimes(1);
    expect(repository.event).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'team.two_factor_required',
        targetLabel: 'Ada Labs',
        details: { enabled: true },
      }),
    );
  });

  it('turns it off, and records nothing when nothing changes', async () => {
    const on = service(membership('OWNER', true, true));
    await expect(
      on.svc.updateTeam(ctx(), 'ada-labs', { requireTwoFactor: false }),
    ).resolves.toMatchObject({ requireTwoFactor: false });
    expect(on.repository.event).toHaveBeenCalledWith(
      expect.objectContaining({ details: { enabled: false } }),
    );

    const off = service(membership('OWNER', false, true));
    await off.svc.updateTeam(ctx(), 'ada-labs', { requireTwoFactor: false });
    expect(off.repository.updateTeam).not.toHaveBeenCalled();
    expect(off.repository.event).not.toHaveBeenCalled();
  });
});
