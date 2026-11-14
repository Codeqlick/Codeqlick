import { describe, expect, it } from 'vitest';
import { ApiError, isBreachedPasswordError } from './errors';

function refused(path: string, message = 'breached', status = 400): ApiError {
  return new ApiError(status, { errors: [{ path, message }] });
}

describe('isBreachedPasswordError', () => {
  it('recognises the API refusing a breached password on the given field', () => {
    expect(isBreachedPasswordError(refused('password'))).toBe(true);
    expect(isBreachedPasswordError(refused('newPassword'), 'newPassword')).toBe(true);
  });

  it('ignores other fields, other messages, other statuses and other errors', () => {
    expect(isBreachedPasswordError(refused('newPassword'))).toBe(false);
    expect(isBreachedPasswordError(refused('password', 'required'))).toBe(false);
    expect(isBreachedPasswordError(refused('password', 'breached', 429))).toBe(false);
    expect(isBreachedPasswordError(new Error('breached'))).toBe(false);
  });
});
