import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../generated/prisma/client.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { AccountRepository } from './account.repository.js';
import {
  acceptInvitationSchema,
  registerSchema,
  setUsernameSchema,
  USERNAME_PATTERN,
} from './auth.schemas.js';
import {
  isReservedUsername,
  normalizeUsername,
  usernameColumns,
  usernameKey,
  usernameRuleProblem,
} from './username.js';
import { UsernameService } from './username.service.js';

describe('username rules', () => {
  it('accepts letters of either case, digits, dots and underscores', () => {
    for (const name of ['Ana', 'ana', 'ANA', 'Ana.M_1', 'a1B', 'x'.repeat(20), 'J.R.R_Tolkien']) {
      expect(USERNAME_PATTERN.test(name)).toBe(true);
    }
  });

  it('refuses the wrong length, odd characters, edges other than a letter or digit, and ..', () => {
    for (const name of ['ab', 'x'.repeat(21), 'ana-m', 'Ána', 'ana m', '.Ana', 'Ana_', 'An..a']) {
      expect(USERNAME_PATTERN.test(name)).toBe(false);
    }
  });

  it('keeps the capitals and drops a leading @ and the spaces around', () => {
    expect(normalizeUsername('  @Ana.M ')).toBe('Ana.M');
    expect(normalizeUsername('ANA')).toBe('ANA');
  });

  it('compares and stores the key in lower case', () => {
    expect(usernameKey('Ana.M')).toBe('ana.m');
    expect(usernameColumns('Ana.M')).toEqual({ username: 'Ana.M', usernameLower: 'ana.m' });
    expect(usernameColumns(null)).toEqual({ username: null, usernameLower: null });
  });

  it('refuses reserved names in any capitals, ignoring dots and underscores', () => {
    for (const name of ['admin', 'ADMIN', 'Admin', 'Code.Qlick', 'SUPPORT', 'sys_tem']) {
      expect(isReservedUsername(name)).toBe(true);
      expect(usernameRuleProblem(name)).toBe('reserved');
      expect(usernameRuleProblem(name, true)).toBeNull();
    }
    expect(isReservedUsername('Ana')).toBe(false);
    expect(usernameRuleProblem('a..b')).toBe('invalid');
  });

  it('requires a username to sign up and to accept an invitation, trimmed with its capitals', () => {
    const signup = {
      name: 'Ana',
      email: 'ana@example.com',
      password: 'a-long-password-1',
      locale: 'en',
      acceptPrivacy: true,
    };
    expect(registerSchema.safeParse(signup).success).toBe(false);
    const parsed = registerSchema.parse({ ...signup, username: '  Ana.M ' });
    expect(parsed.username).toBe('Ana.M');

    const invited = { ...signup, token: 'invitation-token' };
    delete (invited as Partial<typeof invited>).email;
    expect(acceptInvitationSchema.safeParse(invited).success).toBe(false);
    expect(acceptInvitationSchema.parse({ ...invited, username: 'ANA' }).username).toBe('ANA');

    expect(setUsernameSchema.parse({ username: ' Ana ' }).username).toBe('Ana');
  });
});

describe('UsernameService', () => {
  const ana = {
    id: 'a0a0a0a0-0000-4000-8000-000000000001',
    email: 'ana@example.com',
    name: 'Ana',
    role: 'CLIENT',
    isActive: true,
    username: 'ana',
    usernameLower: 'ana',
  } as User;
  let owners: Map<string, string>;
  let repository: {
    findById: ReturnType<typeof vi.fn>;
    usernameOwner: ReturnType<typeof vi.fn>;
    setUsername: ReturnType<typeof vi.fn>;
  };
  let activity: { record: ReturnType<typeof vi.fn> };
  let service: UsernameService;

  beforeEach(() => {
    owners = new Map([['ana', ana.id]]);
    repository = {
      findById: vi.fn((id: string) =>
        Promise.resolve(
          id === ana.id ? ana : ({ id, role: 'ADMIN', isActive: true, username: null } as User),
        ),
      ),
      usernameOwner: vi.fn((key: string) => {
        const id = owners.get(key);
        return Promise.resolve(id ? { id } : null);
      }),
      setUsername: vi.fn((id: string, username: string | null) =>
        Promise.resolve({ ...ana, id, ...usernameColumns(username) }),
      ),
    };
    activity = { record: vi.fn().mockResolvedValue(undefined) };
    service = new UsernameService(
      repository as unknown as AccountRepository,
      activity as unknown as ActivityService,
    );
  });

  it('finds the holder ignoring capitals', async () => {
    expect(await service.problem('someone-else', 'ANA')).toBe('taken');
    expect(repository.usernameOwner).toHaveBeenCalledWith('ana');
    expect(await service.problem(null, 'Ana')).toBe('taken');
    expect(await service.problem(null, 'Ana.Maria')).toBeNull();
  });

  it('counts the own name, in any capitals, as available', async () => {
    expect(await service.problem(ana.id, 'ANA')).toBeNull();
  });

  it('keeps reserved names for the team: refused to clients and to sign-ups, in any capitals', async () => {
    expect(await service.problem(ana.id, 'CodeQlick')).toBe('reserved');
    expect(await service.problem(null, 'CODEQLICK')).toBe('reserved');
    expect(await service.problem('team-admin', 'Codeqlick')).toBeNull();
  });

  it('lets the owner change only the capitals of their username', async () => {
    const user = await service.claim(ana.id, ' Ana ');

    expect(repository.setUsername).toHaveBeenCalledWith(ana.id, 'Ana');
    expect(user.username).toBe('Ana');
    expect(activity.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ details: { from: 'ana', to: 'Ana' } }),
    );
  });

  it('refuses a name another account holds in other capitals', async () => {
    owners.set('bea', 'someone-else');

    await expect(service.claim(ana.id, 'BEA')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.setUsername).not.toHaveBeenCalled();
  });

  it('answers taken when the unique index refuses the write (two people at once)', async () => {
    repository.setUsername.mockResolvedValue(null);

    const error = await service.claim(ana.id, 'Bea').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      errors: [{ path: 'username', message: 'taken' }],
    });
    expect(activity.record).not.toHaveBeenCalled();
  });
});
