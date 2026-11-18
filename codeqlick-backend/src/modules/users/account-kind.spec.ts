import { describe, expect, it } from 'vitest';
import { appsOf, kindOf, signupAppOf, type UserWithUsage } from './account-kind.js';

const counts = {
  members: 0,
  clientProjects: 0,
  proposals: 0,
  tickets: 0,
  leadsConverted: 0,
  meetingRooms: 0,
  bookingPages: 0,
};

function user(over: Partial<UserWithUsage> = {}, count: Partial<typeof counts> = {}) {
  return {
    role: 'CLIENT',
    registeredAt: new Date(),
    memberOfId: null,
    signupApp: null,
    ...over,
    _count: { ...counts, ...count },
  } as UserWithUsage;
}

describe('account kind', () => {
  it('has no kind for admins', () => {
    expect(kindOf(user({ role: 'ADMIN' }))).toBeNull();
  });

  it('is a client with client work, a company or an account the team prepared', () => {
    expect(kindOf(user({ registeredAt: null }))).toBe('client');
    expect(kindOf(user({ memberOfId: 'a' }))).toBe('client');
    expect(kindOf(user({}, { proposals: 1 }))).toBe('client');
    expect(kindOf(user({ signupApp: 'citas' }, { clientProjects: 1 }))).toBe('client');
  });

  it('is an app user when it only signed up from or uses our web apps', () => {
    const booker = user({ signupApp: 'cloud' }, { meetingRooms: 1 });
    expect(kindOf(booker)).toBe('app');
    expect(appsOf(booker)).toEqual(['meetings', 'cloud']);
    expect(kindOf(user({}, { bookingPages: 2 }))).toBe('app');
    expect(kindOf(user())).toBe('none');
  });

  it('ignores a sign-up app it no longer knows', () => {
    expect(signupAppOf({ signupApp: 'gone' })).toBeNull();
    expect(signupAppOf({ signupApp: 'citas' })).toBe('citas');
  });
});
