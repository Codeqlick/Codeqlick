import { describe, expect, it } from 'vitest';
import { isReservedDomain } from './cloud-domains.service.js';

const own = ['codeqlick.app', 'codeqlick.com', 'demo.codeqlick.com'];
const platform = { domains: ['docs.codeqlick.com'], teamId: 'team-1', projectTeamId: 'team-1' };

describe('isReservedDomain', () => {
  it('refuses Codeqlick domains and allows others', () => {
    const none = { domains: [], teamId: undefined, projectTeamId: 'team-1' };
    expect(isReservedDomain('codeqlick.com', own, none)).toBe(true);
    expect(isReservedDomain('docs.codeqlick.com', own, none)).toBe(true);
    expect(isReservedDomain('x.codeqlick.app', own, none)).toBe(true);
    expect(isReservedDomain('example.org', own, platform)).toBe(false);
    expect(isReservedDomain('notcodeqlick.com', own, platform)).toBe(false);
  });

  it('allows an exact listed domain for the platform team only', () => {
    expect(isReservedDomain('docs.codeqlick.com', own, platform)).toBe(false);
    expect(
      isReservedDomain('docs.codeqlick.com', own, { ...platform, projectTeamId: 'team-2' }),
    ).toBe(true);
  });

  it('does not cover subdomains, unlisted domains or the apex', () => {
    expect(isReservedDomain('a.docs.codeqlick.com', own, platform)).toBe(true);
    expect(isReservedDomain('blog.codeqlick.com', own, platform)).toBe(true);
    expect(isReservedDomain('codeqlick.com', own, platform)).toBe(true);
  });

  it('has no exception while the team or the domains are unset', () => {
    expect(isReservedDomain('docs.codeqlick.com', own, { ...platform, teamId: undefined })).toBe(
      true,
    );
    expect(isReservedDomain('docs.codeqlick.com', own, { ...platform, domains: [] })).toBe(true);
  });
});
