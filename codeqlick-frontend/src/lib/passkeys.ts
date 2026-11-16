/**
 * Passkeys (architecture 4.3, decision 104): helpers shared by the Server Actions and the Client
 * Components that run the WebAuthn ceremonies (usable on server and client).
 */
import { describeUserAgent } from './user-agent';

/** How many passkeys an account may have (the API refuses the 11th). */
export const MAX_PASSKEYS = 10;
export const PASSKEY_NAME_MAX = 40;

/** What went wrong in the browser, as the message the page shows. */
export type PasskeyErrorKind = 'cancelled' | 'exists' | 'unsupported' | 'failed';

/**
 * Sorts a browser error from `startRegistration` / `startAuthentication` (a WebAuthnError with a
 * `code`, or the DOMException itself) into what the person is told.
 */
export function passkeyErrorKind(error: unknown): PasskeyErrorKind {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') {
    return 'exists';
  }
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
    return 'cancelled';
  }
  if (name === 'NotSupportedError' || code === 'ERROR_INVALID_DOMAIN') return 'unsupported';
  return 'failed';
}

/** A ceremony stopped on purpose (another one started, e.g. the button over the autofill). */
export function isAbort(error: unknown): boolean {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  return name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED';
}

/** Largest WebAuthn response the website passes on to the API. */
const MAX_RESPONSE_LENGTH = 100_000;

/**
 * A browser's WebAuthn response as JSON, checked before a Server Action forwards it: a plain
 * object with an id, `type: 'public-key'` and a response object. The API checks the rest.
 */
export function isWebAuthnResponse(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { id, type, response } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0 || type !== 'public-key') return false;
  if (typeof response !== 'object' || response === null || Array.isArray(response)) return false;
  try {
    return JSON.stringify(value).length <= MAX_RESPONSE_LENGTH;
  } catch {
    return false;
  }
}

/** A passkey's name as typed: trimmed, spaces collapsed; null when too long. */
export function cleanPasskeyName(raw: unknown): string | null {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  return name.length > PASSKEY_NAME_MAX ? null : name;
}

/** A name to start from: the browser and system ("Chrome on macOS"), or empty. */
export function suggestedPasskeyName(
  userAgent: string | null,
  join: (browser: string, os: string) => string = (browser, os) => `${browser} · ${os}`,
): string {
  const { browser, os } = describeUserAgent(userAgent);
  const name = browser && os ? join(browser, os) : (browser ?? os ?? '');
  return name.slice(0, PASSKEY_NAME_MAX);
}
