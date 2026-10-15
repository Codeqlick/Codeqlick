/** Cookie holding the short-lived JWT access token (httpOnly). */
export const ACCESS_COOKIE = 'cq_at';
/** Cookie holding the rotating refresh token (httpOnly, 30 days). */
export const REFRESH_COOKIE = 'cq_rt';

export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30;

/** Cookie holding the two-step sign-in challenge between the password and the code (httpOnly). */
export const TWO_FACTOR_COOKIE = 'cq_2fa';
/** Same lifetime as the API's challenge token. */
export const TWO_FACTOR_MAX_AGE = 5 * 60;

/** Paths that need a session: /en/portal, /es/admin/leads, ... */
export const PROTECTED_PATH = /^\/(en|es)\/(portal|admin)(\/|$)/;
