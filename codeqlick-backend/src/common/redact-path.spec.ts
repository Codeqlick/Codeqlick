import { describe, expect, it } from 'vitest';
import { redactHookPath } from './redact-path.js';

const token = 'cqd_AbCdEfGh1234567890abcdefghijklmnopqrstuvw';

describe('redactHookPath', () => {
  it('keeps the first 12 characters of a hook token (cqd_ and 8) and hides the rest', () => {
    expect(redactHookPath(`/v1/cloud/hooks/${token}`)).toBe('/v1/cloud/hooks/cqd_AbCdEfGh…');
  });

  it('works inside a full URL, a log line and with a query string', () => {
    expect(redactHookPath(`https://api.codeqlick.com/v1/cloud/hooks/${token}?x=1`)).toBe(
      'https://api.codeqlick.com/v1/cloud/hooks/cqd_AbCdEfGh…?x=1',
    );
    expect(redactHookPath(`Unhandled error on POST /v1/cloud/hooks/${token} (requestId=1)`)).toBe(
      'Unhandled error on POST /v1/cloud/hooks/cqd_AbCdEfGh… (requestId=1)',
    );
  });

  it('never leaves the token anywhere in the result', () => {
    expect(redactHookPath(`/v1/cloud/hooks/${token}`)).not.toContain(token.slice(12));
  });

  it('hides whatever follows the hooks path, even a malformed token', () => {
    expect(redactHookPath('/v1/cloud/hooks/secret-value-that-is-long')).toBe(
      '/v1/cloud/hooks/secret-value…',
    );
  });

  it('leaves every other path as it is', () => {
    expect(redactHookPath('/v1/cloud/projects/1/hooks')).toBe('/v1/cloud/projects/1/hooks');
    expect(redactHookPath('/v1/cloud/forms/cqf_abc')).toBe('/v1/cloud/forms/cqf_abc');
    expect(redactHookPath('')).toBe('');
  });
});
