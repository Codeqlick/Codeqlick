import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

/** Express request as seen by our guards, decorators and filter. */
export type AppRequest = Request & {
  /** Set by pino-http (genReqId). */
  id?: string | number | object;
  /** Set by JwtAuthGuard on authenticated routes. */
  user?: AuthUser;
};
