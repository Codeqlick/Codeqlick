import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { entryRefusal } from './adult-entry';

const t = (key: 'notAllowed' | 'underage') => key;

describe('entryRefusal', () => {
  it("says the account can't use the 18+ apps when the API says so", () => {
    const error = new ApiError(403, {
      title: 'Forbidden',
      detail: "This account can't use Codeqlick's 18+ apps; contact hello@codeqlick.com",
    });
    expect(entryRefusal(error, t)).toBe('notAllowed');
  });

  it('keeps the app\'s own "18 or over" for any other refusal', () => {
    expect(entryRefusal(new ApiError(403, { title: 'Forbidden', detail: 'Too young' }), t)).toBe(
      'underage',
    );
    expect(entryRefusal(new Error('boom'), t)).toBe('underage');
  });
});
