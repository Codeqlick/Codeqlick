import { describe, expect, it } from 'vitest';
import {
  initials,
  ME_SECTIONS,
  meSections,
  PROFILE_GAPS,
  profileCompleteness,
} from './cruising-profile';

const full = { bio: 'Quiet evenings', country: 'ES', lookingFor: ['CHAT'] };

describe("Cruising's profile pages", () => {
  it('makes initials from the nickname', () => {
    expect(initials('pier_fan')).toBe('PF');
    expect(initials('ana')).toBe('AN');
    expect(initials('ana_x1')).toBe('AX');
    expect(initials('bob2go')).toBe('BG');
    expect(initials('x')).toBe('X');
    expect(initials('___')).toBe('__');
  });

  it('shows every section of /me with a nickname, and those that need none without', () => {
    expect(meSections(true)).toEqual([...ME_SECTIONS]);
    expect(meSections(false)).toEqual(['profile', 'notifications', 'safety', 'privacy']);
  });

  it('links every gap to a section of /me', () => {
    for (const section of Object.values(PROFILE_GAPS)) expect(ME_SECTIONS).toContain(section);
  });

  it('counts a complete profile', () => {
    expect(
      profileCompleteness({
        profile: full,
        hasPhoto: true,
        verification: 'APPROVED',
        verified: true,
      }),
    ).toEqual({ done: 6, total: 6, percent: 100, missing: [] });
  });

  it('lists what is missing, in order, and counts a pending verification as done', () => {
    expect(
      profileCompleteness({
        profile: { bio: '  ', country: null, lookingFor: [] },
        hasPhoto: false,
        verification: 'PENDING',
        verified: false,
      }),
    ).toEqual({
      done: 2,
      total: 6,
      percent: 33,
      missing: ['photo', 'bio', 'lookingFor', 'country'],
    });
    expect(
      profileCompleteness({
        profile: full,
        hasPhoto: true,
        verification: 'REJECTED',
        verified: false,
      }).missing,
    ).toEqual(['verification']);
  });

  it('starts with the nickname when there is no profile yet', () => {
    const result = profileCompleteness({
      profile: null,
      hasPhoto: false,
      verification: 'NONE',
      verified: false,
    });
    expect(result.done).toBe(0);
    expect(result.missing[0]).toBe('nickname');
  });
});
