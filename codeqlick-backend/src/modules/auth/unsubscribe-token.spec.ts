import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  makeUnsubscribeToken,
  maskEmail,
  unsubscribeLinks,
  verifyUnsubscribeToken,
} from './unsubscribe-token.js';

const secret = 'test-secret-test-secret-test-secret-test-secret';
const userId = '6f1c2b0e-8a43-4c1e-9d3b-2f7a1e5c9b10';

describe('unsubscribe tokens', () => {
  it('signs base64url(<userId>:<kind>) with a key derived from the secret', () => {
    const token = makeUnsubscribeToken({ userId, kind: 'digest' }, secret);
    const [payload, signature] = token.split('.');
    expect(Buffer.from(payload!, 'base64url').toString()).toBe(`${userId}:digest`);
    const key = createHmac('sha256', secret).update('email-unsubscribe').digest();
    expect(signature).toBe(createHmac('sha256', key).update(payload!).digest('base64url'));
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/);
  });

  it('reads back a genuine token of either kind', () => {
    for (const kind of ['digest', 'report'] as const) {
      const token = makeUnsubscribeToken({ userId, kind }, secret);
      expect(verifyUnsubscribeToken(token, secret)).toEqual({ userId, kind });
    }
  });

  it('refuses forged, altered or malformed tokens', () => {
    const token = makeUnsubscribeToken({ userId, kind: 'digest' }, secret);
    const [payload, signature] = token.split('.') as [string, string];
    const other = Buffer.from(`${userId}:report`).toString('base64url');
    const sign = (value: string) =>
      createHmac('sha256', createHmac('sha256', secret).update('email-unsubscribe').digest())
        .update(value)
        .digest('base64url');
    const unknownKind = Buffer.from(`${userId}:news`).toString('base64url');
    const noUser = Buffer.from(':digest').toString('base64url');
    for (const bad of [
      makeUnsubscribeToken({ userId, kind: 'digest' }, 'another-secret'),
      `${other}.${signature}`,
      `${payload}.${signature.slice(0, -1)}`,
      `${payload}.${signature}A`,
      `${payload}.${signature}.x`,
      `${payload}.`,
      `.${signature}`,
      `${payload}.${signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))}`,
      `${unknownKind}.${sign(unknownKind)}`,
      `${noUser}.${sign(noUser)}`,
      `${payload}+.${signature}`,
      payload,
      '',
    ]) {
      expect(verifyUnsubscribeToken(bad, secret)).toBeNull();
    }
  });

  it('builds the one-click API URL and the localised website page', () => {
    const links = unsubscribeLinks({ userId, kind: 'report' }, 'es', {
      secret,
      publicApiUrl: 'https://api.codeqlick.com/v1/',
      siteUrl: 'https://codeqlick.com',
    });
    const token = makeUnsubscribeToken({ userId, kind: 'report' }, secret);
    expect(links).toEqual({
      oneClick: `https://api.codeqlick.com/v1/email/unsubscribe?token=${token}`,
      page: `https://codeqlick.com/es/email/unsubscribe?token=${token}`,
    });
  });

  it('masks the email', () => {
    expect(maskEmail('lin@example.com')).toBe('l***@example.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('broken')).toBe('***');
  });
});
