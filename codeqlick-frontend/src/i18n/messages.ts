/** A message catalogue: nested objects of ICU strings. */
export type Messages = { [key: string]: string | Messages };

/**
 * What French, German, Italian and Portuguese translate (decision 103): every namespace Cruising's
 * host and the account site (decision 108) show (their pages, the sign-in pages, the frame, the
 * errors and the forms), as
 * top-level namespaces or `Namespace.part`. The rest of the catalogue is English in those
 * languages (`withFallback`); a test keeps these in step with en.json.
 */
export const CRUISING_NAMESPACES = [
  'Common',
  'Error',
  'NotFound',
  'Validation',
  'Pagination',
  'Markdown',
  'Legal',
  'Metadata',
  'App',
  'AppSwitcher',
  'AppMenu',
  'LocaleSwitcher',
  'Login',
  'TwoFactorLogin',
  'Register',
  'ForgotPassword',
  'ResetPassword',
  // The account site speaks the six languages too (decision 108).
  'Account',
  'AccountSite',
  'TwoFactor',
  'Passkeys',
  'Sessions',
  'ConfirmEmail',
  'Videochat.push',
  'Cruising',
  'CruisingSafety',
  'CruisingHealth',
  'CruisingHealthCenters',
  // Neoqlick's portal (architecture 4.18).
  'Neoqlick',
] as const;

/** `messages` over `fallback`, key by key: what `messages` lacks comes from `fallback`. */
export function withFallback(messages: Messages, fallback: Messages): Messages {
  const merged: Messages = { ...fallback };
  for (const [key, value] of Object.entries(messages)) {
    const base = fallback[key];
    merged[key] =
      typeof value === 'object' && typeof base === 'object' ? withFallback(value, base) : value;
  }
  return merged;
}

/** `base` with every key of `over` replacing its own: Neoqlick's wording over the shared messages. */
export function overlay(base: Messages, over: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = merged[key];
    merged[key] =
      typeof value === 'object' && typeof current === 'object' ? overlay(current, value) : value;
  }
  return merged;
}

/**
 * The namespaces Neoqlick's hosts can render (architecture 4.18): the portal, the account host,
 * the sign-in pages and the three apps. A test walks them, with Neoqlick's wording applied, and
 * fails when `codeqlick` appears in any language.
 */
export const NEOQLICK_NAMESPACES = [
  'Common',
  'Error',
  'NotFound',
  'Validation',
  'Pagination',
  'Markdown',
  'Legal',
  'Metadata',
  'App',
  'AppSwitcher',
  'AppMenu',
  'LocaleSwitcher',
  'Login',
  'TwoFactorLogin',
  'Register',
  'ForgotPassword',
  'ResetPassword',
  'Account',
  'AccountSite',
  'TwoFactor',
  'Passkeys',
  'Sessions',
  'ConfirmEmail',
  'Unsubscribe',
  'Neoqlick',
  'Videochat',
  'Swipe',
  'Cruising',
  'CruisingSafety',
  'CruisingHealth',
  'CruisingHealthCenters',
  'SafetyContact',
] as const;
