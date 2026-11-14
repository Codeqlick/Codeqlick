/**
 * The unsubscribe page of the optional emails (architecture 4.3, "Unsubscribe links", and 6.2,
 * "Unsubscribe page"). Pure helpers shared by its Server Component, Server Action and form.
 */

/** `digest`: the weekly summary (`weeklyDigest`); `report`: the monthly website report. */
export type EmailKind = 'digest' | 'report';

/** `GET` / `PUT /email/preferences`: what the token's link is about. `email` comes masked. */
export type EmailPreferences = { kind: EmailKind; subscribed: boolean; email: string };

/**
 * Why a call failed: `invalidLink` for a token the API doesn't know (or a deleted account, which
 * it answers the same), `retry` for anything that may work later (rate limit, API down).
 */
export type PreferencesProblem = 'invalidLink' | 'retry';

export function preferencesProblem(status: number): PreferencesProblem {
  // 400 too: a token that isn't even well formed is as dead as an unknown one.
  return status === 404 || status === 400 ? 'invalidLink' : 'retry';
}

/** The form's state: the preference as the API last answered it, and the last call's problem. */
export type UnsubscribeState = {
  subscribed: boolean;
  /** True once the person has changed it on this page (the page confirms the change). */
  changed: boolean;
  problem?: PreferencesProblem;
};

type SubscribedView = 'subscribed' | 'resubscribed';
type UnsubscribedView = 'unsubscribed' | 'alreadyUnsubscribed';
export type UnsubscribeView = SubscribedView | UnsubscribedView;

/** What the page says: the state as found when opening the link, or the change just made. */
export function unsubscribeView({ subscribed, changed }: UnsubscribeState): UnsubscribeView {
  if (subscribed) return changed ? 'resubscribed' : 'subscribed';
  return changed ? 'unsubscribed' : 'alreadyUnsubscribed';
}
