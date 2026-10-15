export type UserRole = 'ADMIN' | 'CLIENT';

/** The authenticated caller, attached to `request.user` by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Session (refresh-token family) the access token was issued for; absent in older tokens. */
  sessionId?: string;
  /**
   * Clients: the client account they act for — their own, or the company account they are a
   * member of. Absent in older tokens (then it is `id`); use `accountOf`.
   */
  accountId?: string;
}

/** The client account whose projects, requests and proposals the caller sees. */
export function accountOf(user: AuthUser): string {
  return user.accountId ?? user.id;
}

/** Claims carried by the access token (JWT, HS256). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  /** Refresh-token family: identifies the signed-in device. */
  sid?: string;
  /** Client account (company) a member acts for; absent for everyone else. */
  acc?: string;
}
