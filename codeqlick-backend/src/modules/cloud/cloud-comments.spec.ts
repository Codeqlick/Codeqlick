import { describe, expect, it } from 'vitest';
import { OVERLAY_SCRIPT, renderCommentsPage } from './cloud-comments-page.js';
import {
  commentsAllowed,
  signCommentToken,
  threadLabel,
  verifyCommentToken,
} from './cloud-comments.js';
import { protectionKey } from './cloud-protection.js';
import { corsFromGarage, corsToGarage } from './garage.client.js';
import { publicUrl, sameCors } from './cloud-storage.service.js';
import { corsRuleSchema, createThreadSchema } from './cloud.schemas.js';

const key = protectionKey('a-test-secret-of-enough-length-1234567890', 'cloud-comments-v1');
const claim = {
  userId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  deploymentId: '33333333-3333-4333-8333-333333333333',
  expiresAt: 2_000_000_000,
};
const host = 'web--abcdef12.codeqlick.app';

describe('the comments token', () => {
  it('verifies for its address until it expires', () => {
    const token = signCommentToken(key, claim, host);
    expect(verifyCommentToken(key, token, host, 1_000_000_000_000)).toEqual(claim);
    expect(
      verifyCommentToken(key, token, 'WEB--ABCDEF12.codeqlick.app', 1_000_000_000_000),
    ).toEqual(claim);
    // Expired.
    expect(verifyCommentToken(key, token, host, 2_000_000_000_000)).toBeNull();
  });

  it('is refused on another address, with another key or when changed', () => {
    const token = signCommentToken(key, claim, host);
    const now = 1_000_000_000_000;
    expect(verifyCommentToken(key, token, 'web.codeqlick.app', now)).toBeNull();
    expect(verifyCommentToken(key, token, 'web--00000000.codeqlick.app', now)).toBeNull();
    const other = protectionKey('a-test-secret-of-enough-length-1234567890', 'cloud-protection-v1');
    expect(verifyCommentToken(other, token, host, now)).toBeNull();
    const forged = token.replace(claim.userId, '44444444-4444-4444-8444-444444444444');
    expect(verifyCommentToken(key, forged, host, now)).toBeNull();
    const later = token.replace('2000000000', '2100000000');
    expect(verifyCommentToken(key, later, host, now)).toBeNull();
    expect(verifyCommentToken(key, undefined, host, now)).toBeNull();
    expect(verifyCommentToken(key, 'v1.x.y', host, now)).toBeNull();
  });

  it('only deployment addresses answer comments', () => {
    expect(commentsAllowed('previews', host)).toBe(true);
    expect(commentsAllowed('previews', 'web--b-feat-x.codeqlick.app')).toBe(false);
    expect(commentsAllowed('production', host)).toBe(false);
    expect(commentsAllowed('production', 'shop.example.com')).toBe(false);
    expect(commentsAllowed(undefined, host)).toBe(false);
  });

  it('labels a thread by deployment and path', () => {
    expect(threadLabel('abcdef12', '/about')).toBe('abcdef12 /about');
    expect(threadLabel('abcdef12', `/${'a'.repeat(400)}`)).toHaveLength(200);
  });
});

describe('the comments page', () => {
  it('escapes its configuration and loads only its own script', () => {
    const html = renderCommentsPage({ locale: 'es', path: '/</script><script>alert(1)' });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).toContain('<script src="/__codeqlick/comments/overlay.js"></script>');
    expect(html).toContain('Comentarios');
  });

  it('never renders comment text as HTML', () => {
    expect(OVERLAY_SCRIPT).not.toContain('innerHTML');
    expect(OVERLAY_SCRIPT).toContain('textContent');
  });
});

describe('a thread', () => {
  it('takes a pin on a same-host path', () => {
    const ok = createThreadSchema.safeParse({ path: '/a?b=1', x: 10, y: 99.5, body: ' Hi ' });
    expect(ok.success && ok.data).toMatchObject({ body: 'Hi', mentions: [] });
    for (const path of ['//evil.test', 'https://evil.test', '/a b', '/\\x']) {
      expect(createThreadSchema.safeParse({ path, x: 1, y: 1, body: 'x' }).success).toBe(false);
    }
    expect(createThreadSchema.safeParse({ path: '/', x: 101, y: 1, body: 'x' }).success).toBe(
      false,
    );
    expect(
      createThreadSchema.safeParse({ path: '/', x: 1, y: 1, body: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('CORS rules', () => {
  it('fills the defaults and normalises origins and methods', () => {
    const rule = corsRuleSchema.parse({
      origins: ['https://Example.com', 'https://example.com', 'http://localhost:3000'],
      methods: ['PUT', 'GET'],
    });
    expect(rule).toEqual({
      origins: ['https://example.com', 'http://localhost:3000'],
      methods: ['GET', 'PUT'],
      headers: ['*'],
      exposeHeaders: ['ETag'],
      maxAge: 3600,
    });
    expect(corsFromGarage(corsToGarage(rule))).toEqual(rule);
    expect(sameCors(rule, { ...rule, methods: ['PUT', 'GET'] })).toBe(true);
    expect(sameCors(rule, { ...rule, maxAge: 1 })).toBe(false);
    expect(sameCors(null, null)).toBe(true);
    expect(sameCors(rule, null)).toBe(false);
  });

  it('refuses paths, other schemes and too many origins', () => {
    for (const origins of [['https://a.test/path'], ['ftp://a.test'], []]) {
      expect(corsRuleSchema.safeParse({ origins }).success).toBe(false);
    }
    const eleven = Array.from({ length: 11 }, (_, i) => `https://s${i}.test`);
    expect(corsRuleSchema.safeParse({ origins: eleven }).success).toBe(false);
    expect(corsRuleSchema.safeParse({ origins: ['*'], maxAge: 86_401 }).success).toBe(false);
  });

  it('gives a public bucket its address under /_public/', () => {
    expect(publicUrl('https://s3.codeqlick.app', 'media')).toBe(
      'https://s3.codeqlick.app/_public/media/',
    );
  });
});
