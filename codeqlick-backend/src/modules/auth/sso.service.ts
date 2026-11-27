import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  isLoopbackRedirect,
  isNativeSsoClient,
  type AnySsoClient,
} from '../../common/sso-clients.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService, hashRefreshToken, type AuthTokens, type ClientInfo } from './auth.service.js';
import { SsoRepository } from './sso.repository.js';

/** How long a single sign-on code can be exchanged. */
export const SSO_CODE_TTL_SECONDS = 60;

/** RFC 7636's S256: base64url(SHA-256(verifier)) without padding. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Whether `verifier` matches `challenge`, compared in constant time. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  const expected = Buffer.from(pkceChallenge(verifier));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const INVALID_CODE = 'Invalid or expired code';

/** What a code is asked for: the client, its PKCE challenge and, for a desktop program, its redirect. */
export interface SsoCodeRequest {
  client: AnySsoClient;
  codeChallenge: string;
  redirectUri: string | null;
}

/** What a code is exchanged with. */
export interface SsoExchangeRequest {
  client: AnySsoClient;
  code: string;
  codeVerifier: string;
  redirectUri: string | null;
}

/**
 * Single sign-on (architecture 4.3, decision 108): the account host's session asks for a one-time
 * code for a client host; that host's server exchanges it, with the PKCE verifier only it knows,
 * for a session family of its own. A desktop program does the same from the person's machine, its
 * code bound also to the loopback address the browser brought it to.
 */
@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    private readonly codes: SsoRepository,
    private readonly sessions: AuthRepository,
    private readonly auth: AuthService,
  ) {}

  /** A code for `client`, issued only to a live account-host session of an active account. */
  async createCode(
    user: AuthUser,
    { client, codeChallenge, redirectUri }: SsoCodeRequest,
    now = new Date(),
  ): Promise<{ code: string; expiresIn: number }> {
    // The request's schema already holds this; kept here so no caller can store a web client's
    // code with a redirect, or a desktop program's without one.
    const native = isNativeSsoClient(client);
    if (native ? !isLoopbackRedirect(redirectUri) : redirectUri !== null) {
      throw new BadRequestException('Invalid redirect');
    }
    if (user.via === 'token' || !user.sessionId) {
      throw new UnauthorizedException('A signed-in session is required');
    }
    const family = await this.sessions.findLiveFamily(user.sessionId, now);
    if (!family || family.userId !== user.id) throw new UnauthorizedException('Session ended');
    // An app's own session can't hand out sessions for other hosts: only the account host's.
    if (family.parentFamilyId) {
      throw new UnauthorizedException('Only the account session can sign in other hosts');
    }
    const account = await this.sessions.findUserById(user.id);
    if (!account || !account.isActive || !account.registeredAt) {
      throw new UnauthorizedException('Account not available');
    }

    const code = randomBytes(32).toString('base64url');
    await this.codes.create({
      codeHash: hashRefreshToken(code),
      userId: user.id,
      client,
      codeChallenge,
      redirectUri,
      parentFamilyId: family.familyId,
      expiresAt: new Date(now.getTime() + SSO_CODE_TTL_SECONDS * 1000),
    });
    return { code, expiresIn: SSO_CODE_TTL_SECONDS };
  }

  /** Spends a code with its verifier: tokens for a new session family of `client`. */
  async exchange(
    { client, code, codeVerifier, redirectUri }: SsoExchangeRequest,
    info: ClientInfo = {},
    now = new Date(),
  ): Promise<AuthTokens> {
    const result = await this.codes.spend(hashRefreshToken(code), client, now);
    if (result.status === 'reused') {
      // A code comes back only if it leaked: end the session it gave (RFC 6749, 4.1.2).
      this.logger.warn(`Single sign-on code reused for client ${client}`);
      if (result.code.familyId) await this.sessions.revokeFamily(result.code.familyId);
      throw new BadRequestException(INVALID_CODE);
    }
    if (result.status === 'invalid') throw new BadRequestException(INVALID_CODE);

    const spent = result.code;
    // Checked after spending: a wrong verifier still uses the code up.
    if (!pkceMatches(codeVerifier, spent.codeChallenge)) {
      throw new BadRequestException(INVALID_CODE);
    }
    // A desktop program's code works only with the exact address it was sent to; a web client's
    // has none, so any address sent with it is wrong too.
    if ((spent.redirectUri ?? null) !== redirectUri) throw new BadRequestException(INVALID_CODE);
    const parent = await this.sessions.findLiveFamily(spent.parentFamilyId, now);
    if (!parent || parent.userId !== spent.userId) throw new BadRequestException(INVALID_CODE);
    if (!spent.user.isActive || !spent.user.registeredAt) {
      throw new BadRequestException(INVALID_CODE);
    }

    const { tokens, familyId } = await this.auth.startSsoSession(
      spent.user,
      { client, parentFamilyId: spent.parentFamilyId },
      info,
    );
    await this.codes.setFamily(spent.id, familyId);
    return tokens;
  }
}
