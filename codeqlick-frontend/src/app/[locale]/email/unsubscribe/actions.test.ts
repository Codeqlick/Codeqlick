import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { setEmailSubscriptionAction } from './actions';

// Hoisted above the imports by Vitest: the action gets the mock.
const { updateEmailPreferences } = vi.hoisted(() => ({ updateEmailPreferences: vi.fn() }));
vi.mock('@/lib/api/email-preferences', () => ({ updateEmailPreferences }));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const shown = { subscribed: true, changed: false };

describe('setEmailSubscriptionAction', () => {
  beforeEach(() => updateEmailPreferences.mockReset());

  it('unsubscribes and confirms the change', async () => {
    updateEmailPreferences.mockResolvedValue({
      kind: 'digest',
      subscribed: false,
      email: 'l***@x.com',
    });
    const state = await setEmailSubscriptionAction(
      shown,
      form({ token: 't.s', subscribed: 'false' }),
    );
    expect(updateEmailPreferences).toHaveBeenCalledWith({ token: 't.s', subscribed: false });
    expect(state).toEqual({ subscribed: false, changed: true });
  });

  it('subscribes again (undo)', async () => {
    updateEmailPreferences.mockResolvedValue({
      kind: 'report',
      subscribed: true,
      email: 'l***@x.com',
    });
    const state = await setEmailSubscriptionAction(
      { subscribed: false, changed: true },
      form({ token: 't.s', subscribed: 'true' }),
    );
    expect(updateEmailPreferences).toHaveBeenCalledWith({ token: 't.s', subscribed: true });
    expect(state).toEqual({ subscribed: true, changed: true });
  });

  it('turns a 404 into the invalid-link message', async () => {
    updateEmailPreferences.mockRejectedValue(new ApiError(404));
    const state = await setEmailSubscriptionAction(
      shown,
      form({ token: 't.s', subscribed: 'false' }),
    );
    expect(state).toEqual({ ...shown, problem: 'invalidLink' });
  });

  it('keeps the page as it was and asks to retry when rate-limited or down', async () => {
    updateEmailPreferences.mockRejectedValue(new ApiError(429));
    expect(
      await setEmailSubscriptionAction(shown, form({ token: 't.s', subscribed: 'false' })),
    ).toEqual({ ...shown, problem: 'retry' });
    updateEmailPreferences.mockRejectedValue(new Error('boom'));
    expect(
      await setEmailSubscriptionAction(shown, form({ token: 't.s', subscribed: 'false' })),
    ).toEqual({ ...shown, problem: 'retry' });
  });

  it('never calls the API without a token', async () => {
    const state = await setEmailSubscriptionAction(shown, form({ subscribed: 'false' }));
    expect(updateEmailPreferences).not.toHaveBeenCalled();
    expect(state.problem).toBe('invalidLink');
  });
});
