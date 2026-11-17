import { describe, expect, it } from 'vitest';
import {
  cleanPasskeyName,
  isAbort,
  isWebAuthnResponse,
  passkeyErrorKind,
  showsPasskeySignInError,
  suggestedPasskeyName,
} from './passkeys';

const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('passkeyErrorKind', () => {
  it('tells a cancelled ceremony, an already registered device and the rest apart', () => {
    expect(passkeyErrorKind({ name: 'NotAllowedError' })).toBe('cancelled');
    expect(passkeyErrorKind({ name: 'AbortError', code: 'ERROR_CEREMONY_ABORTED' })).toBe(
      'cancelled',
    );
    expect(
      passkeyErrorKind({
        name: 'InvalidStateError',
        code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
      }),
    ).toBe('exists');
    expect(passkeyErrorKind({ name: 'NotSupportedError' })).toBe('unsupported');
    expect(passkeyErrorKind(new Error('boom'))).toBe('failed');
    expect(passkeyErrorKind(undefined)).toBe('failed');
  });

  it('knows a ceremony stopped on purpose', () => {
    expect(isAbort({ name: 'AbortError' })).toBe(true);
    expect(isAbort({ code: 'ERROR_CEREMONY_ABORTED' })).toBe(true);
    expect(isAbort({ name: 'NotAllowedError' })).toBe(false);
    expect(isAbort(null)).toBe(false);
  });
});

describe('isWebAuthnResponse', () => {
  const response = {
    id: 'abc',
    rawId: 'abc',
    type: 'public-key',
    response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' },
    clientExtensionResults: {},
  };

  it('accepts what the browser returns', () => {
    expect(isWebAuthnResponse(response)).toBe(true);
  });

  it('refuses anything else before it reaches the API', () => {
    expect(isWebAuthnResponse(null)).toBe(false);
    expect(isWebAuthnResponse('abc')).toBe(false);
    expect(isWebAuthnResponse([response])).toBe(false);
    expect(isWebAuthnResponse({ ...response, type: 'password' })).toBe(false);
    expect(isWebAuthnResponse({ ...response, id: '' })).toBe(false);
    expect(isWebAuthnResponse({ ...response, response: 'x' })).toBe(false);
    expect(
      isWebAuthnResponse({ ...response, response: { clientDataJSON: 'x'.repeat(200_000) } }),
    ).toBe(false);
  });
});

describe('passkey names', () => {
  it('trims and collapses spaces, and refuses more than 40 characters', () => {
    expect(cleanPasskeyName('  Work   laptop ')).toBe('Work laptop');
    expect(cleanPasskeyName('')).toBe('');
    expect(cleanPasskeyName(undefined)).toBe('');
    expect(cleanPasskeyName('x'.repeat(40))).toHaveLength(40);
    expect(cleanPasskeyName('x'.repeat(41))).toBeNull();
  });

  it('suggests the browser and system', () => {
    expect(suggestedPasskeyName(MAC_CHROME)).toBe('Chrome · macOS');
    expect(suggestedPasskeyName(MAC_CHROME, (browser, os) => `${browser} en ${os}`)).toBe(
      'Chrome en macOS',
    );
    expect(suggestedPasskeyName(null)).toBe('');
  });
});

describe('showsPasskeySignInError', () => {
  const errors = [
    { name: 'NotAllowedError' },
    { name: 'AbortError', code: 'ERROR_CEREMONY_ABORTED' },
    { name: 'SecurityError' },
    { name: 'NotSupportedError' },
    new TypeError('Failed to fetch'),
    undefined,
  ];

  it('never shows a message for the silent autofill request', () => {
    for (const error of errors) expect(showsPasskeySignInError(error, 'autofill')).toBe(false);
  });

  it('shows nothing when the person cancels the button ceremony', () => {
    expect(showsPasskeySignInError({ name: 'NotAllowedError' }, 'button')).toBe(false);
    expect(showsPasskeySignInError({ name: 'AbortError' }, 'button')).toBe(false);
    expect(showsPasskeySignInError({ code: 'ERROR_CEREMONY_ABORTED' }, 'button')).toBe(false);
  });

  it('shows the message for real failures after the button', () => {
    expect(showsPasskeySignInError({ name: 'SecurityError' }, 'button')).toBe(true);
    expect(showsPasskeySignInError({ name: 'NotSupportedError' }, 'button')).toBe(true);
    expect(showsPasskeySignInError(new Error('boom'), 'button')).toBe(true);
  });
});
