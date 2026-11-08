import { describe, expect, it } from 'vitest';
import { isDisposableEmail } from './disposable-email.js';

describe('isDisposableEmail', () => {
  it('flags addresses of disposable services', () => {
    expect(isDisposableEmail('someone@mailinator.com')).toBe(true);
    expect(isDisposableEmail('Someone@YOPMAIL.COM')).toBe(true);
  });

  it('flags subdomains of a listed domain', () => {
    expect(isDisposableEmail('bot@abc.mailinator.com')).toBe(true);
  });

  it('accepts ordinary providers and company domains', () => {
    expect(isDisposableEmail('someone@gmail.com')).toBe(false);
    expect(isDisposableEmail('someone@outlook.es')).toBe(false);
    expect(isDisposableEmail('hello@codeqlick.com')).toBe(false);
  });

  it('ignores strings without a domain', () => {
    expect(isDisposableEmail('nobody')).toBe(false);
  });
});
