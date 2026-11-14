import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { EmailPreferences } from '@/lib/email-preferences';
import { setEmailSubscriptionAction } from './actions';

// A plain stub instead of a spy: with a vi.fn returning a rejected promise, Vitest 5 failed the
// error cases in CI although the action catches the rejection.
const api = vi.hoisted(() => ({
  calls: [] as unknown[],
  answer: (): Promise<EmailPreferences> => Promise.reject(new Error('not set')),
}));
vi.mock('@/lib/api/email-preferences', () => ({
  updateEmailPreferences: (input: unknown) => {
    api.calls.push(input);
    return api.answer();
  },
}));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function answerWith(preferences: EmailPreferences) {
  api.answer = async () => preferences;
}

function failWith(error: Error) {
  api.answer = async () => {
    throw error;
  };
}

const shown = { subscribed: true, changed: false };

describe('setEmailSubscriptionAction', () => {
  beforeEach(() => {
    api.calls = [];
  });

  it('unsubscribes and confirms the change', async () => {
    answerWith({ kind: 'digest', subscribed: false, email: 'l***@x.com' });
    const state = await setEmailSubscriptionAction(
      shown,
      form({ token: 't.s', subscribed: 'false' }),
    );
    expect(api.calls).toEqual([{ token: 't.s', subscribed: false }]);
    expect(state).toEqual({ subscribed: false, changed: true });
  });

  it('subscribes again (undo)', async () => {
    answerWith({ kind: 'report', subscribed: true, email: 'l***@x.com' });
    const state = await setEmailSubscriptionAction(
      { subscribed: false, changed: true },
      form({ token: 't.s', subscribed: 'true' }),
    );
    expect(api.calls).toEqual([{ token: 't.s', subscribed: true }]);
    expect(state).toEqual({ subscribed: true, changed: true });
  });

  it('turns a 404 into the invalid-link message', async () => {
    failWith(new ApiError(404));
    const state = await setEmailSubscriptionAction(
      shown,
      form({ token: 't.s', subscribed: 'false' }),
    );
    expect(state).toEqual({ ...shown, problem: 'invalidLink' });
  });

  it('keeps the page as it was and asks to retry when rate-limited or down', async () => {
    failWith(new ApiError(429));
    expect(
      await setEmailSubscriptionAction(shown, form({ token: 't.s', subscribed: 'false' })),
    ).toEqual({ ...shown, problem: 'retry' });
    failWith(new Error('boom'));
    expect(
      await setEmailSubscriptionAction(shown, form({ token: 't.s', subscribed: 'false' })),
    ).toEqual({ ...shown, problem: 'retry' });
  });

  it('never calls the API without a token', async () => {
    const state = await setEmailSubscriptionAction(shown, form({ subscribed: 'false' }));
    expect(api.calls).toEqual([]);
    expect(state.problem).toBe('invalidLink');
  });
});
