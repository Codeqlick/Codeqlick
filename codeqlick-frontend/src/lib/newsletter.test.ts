import { describe, expect, it } from 'vitest';
import { looksAutomated, newsletterChoice } from './newsletter';
import { NEWSLETTER_FIELDS, newsletterSchema } from './schemas/newsletter';

const NOW = 1_800_000_000_000;

describe('looksAutomated', () => {
  it('accepts a submission made a few seconds after the box was shown', () => {
    expect(looksAutomated({ website: '', renderedAt: String(NOW - 5000), now: NOW })).toBe(false);
  });

  it('catches a filled honeypot', () => {
    const renderedAt = String(NOW - 9000);
    expect(looksAutomated({ website: 'https://spam.test', renderedAt, now: NOW })).toBe(true);
  });

  it('catches submissions faster than 3 seconds', () => {
    expect(looksAutomated({ website: '', renderedAt: String(NOW - 1000), now: NOW })).toBe(true);
  });

  it('accepts a missing timestamp (scripts off) but still applies the honeypot', () => {
    expect(looksAutomated({ website: '', renderedAt: '', now: NOW })).toBe(false);
    expect(looksAutomated({ website: '', renderedAt: '0', now: NOW })).toBe(false);
    expect(looksAutomated({ website: 'x', renderedAt: '0', now: NOW })).toBe(true);
  });
});

describe('newsletterSchema', () => {
  it('accepts an email with the privacy box ticked', () => {
    const result = newsletterSchema.safeParse({ email: ' ana@example.com ', acceptPrivacy: 'on' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('ana@example.com');
  });

  it('asks for the email, a valid one, and the privacy consent', () => {
    const issues = (input: Record<string, string>) =>
      Object.fromEntries(
        (newsletterSchema.safeParse(input).error?.issues ?? []).map((issue) => [
          issue.path.join('.'),
          issue.message,
        ]),
      );
    expect(issues({ email: '', acceptPrivacy: '' })).toEqual({
      email: 'required',
      acceptPrivacy: 'privacy',
    });
    expect(issues({ email: 'not-an-email', acceptPrivacy: 'on' })).toEqual({ email: 'email' });
  });

  it('lists the form fields it reads', () => {
    expect(NEWSLETTER_FIELDS).toEqual(['email', 'acceptPrivacy']);
  });
});

describe('newsletterChoice', () => {
  it('sends what the box says while the email has not gone out', () => {
    expect(newsletterChoice(false, true)).toBe(true);
    expect(newsletterChoice(false, false)).toBe(false);
  });

  it('sends nothing once it was sent, whatever the disabled box reads', () => {
    expect(newsletterChoice(true, false)).toBeUndefined();
    expect(newsletterChoice(true, true)).toBeUndefined();
  });
});
