import { describe, expect, it } from 'vitest';
import { securityCheckSchema } from './security-check';

const valid = { domain: 'example.com', email: 'a@b.co', name: '', acceptPrivacy: 'on' };
const issues = (input: Record<string, unknown>) => {
  const result = securityCheckSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
};

describe('securityCheckSchema', () => {
  it('accepts a domain, a URL and a host with a path', () => {
    for (const domain of ['example.com', 'https://www.example.com/a?b=1', ' shop.example.es ']) {
      expect(securityCheckSchema.safeParse({ ...valid, domain }).success).toBe(true);
    }
  });

  it('refuses names without a dot or a top-level domain', () => {
    expect(issues({ ...valid, domain: 'localhost' })).toEqual({ domain: 'domain' });
    expect(issues({ ...valid, domain: 'not a domain' })).toEqual({ domain: 'domain' });
  });

  it('asks for the email and the consent', () => {
    expect(issues({ ...valid, email: 'nope', acceptPrivacy: '' })).toEqual({
      email: 'email',
      acceptPrivacy: 'privacy',
    });
  });
});
