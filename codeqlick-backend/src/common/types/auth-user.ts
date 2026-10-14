export type UserRole = 'ADMIN' | 'CLIENT';

/** The authenticated caller, attached to `request.user` by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Session (refresh-token family) the access token was issued for; absent in older tokens. */
  sessionId?: string;
}

/** Claims carried by the access token (JWT, HS256). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  /** Refresh-token family: identifies the signed-in device. */
  sid?: string;
}
