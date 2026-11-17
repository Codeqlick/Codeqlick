/** Cookie holding the short-lived JWT access token (httpOnly). */
export const ACCESS_COOKIE = 'cq_at';
/** Cookie holding the rotating refresh token (httpOnly, 30 days). */
export const REFRESH_COOKIE = 'cq_rt';

export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30;

/** Cookie holding the two-step sign-in challenge between the password and the code (httpOnly). */
export const TWO_FACTOR_COOKIE = 'cq_2fa';
/** Same lifetime as the API's challenge token. */
export const TWO_FACTOR_MAX_AGE = 5 * 60;

/**
 * Paths that need a session: /en/portal, /es/admin/leads, /es/videochat/room, /es/citas/editar/…,
 * Swipe's own pages (its landing, rules and removal form are public), Cruising's proposal,
 * "my spots", profile, members, messages, favourites, meetups and trips pages (the map, spots, places and legal pages are public) and Cloud's console, CLI
 * sign-in and invitations, and the account site's pages (decision 108; not the data download, which
 * checks the session itself). Single sign-on's `auth/authorize` only refreshes one.
 */
export const PROTECTED_PATH =
  /^\/(en|es|fr|de|it|pt)\/(portal|admin|videochat\/room|citas\/editar|swipe\/(?:deck|photos|matches|img)|cruising\/(?:new|my-spots|me|members|messages|favorites|meetups|trips|rooms|notifications)|cloud\/(?:console|cli|invite|github)|account(?!\/export(?:\/|$)))(\/|$)/;

/**
 * Paths open to everyone that still show the signed-in person when there is one: the proxy
 * refreshes an expiring session there, but never sends anyone to sign in (meetings take guests,
 * and anyone books on a Citas page).
 */
export const OPTIONAL_SESSION_PATH =
  /^\/(en|es|fr|de|it|pt)\/(meetings|citas|swipe|cruising|cloud|account|auth\/authorize)(\/|$)/;
