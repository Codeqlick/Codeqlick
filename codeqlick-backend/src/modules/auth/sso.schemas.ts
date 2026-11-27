import { z } from 'zod';
import {
  ALL_SSO_CLIENTS,
  isLoopbackRedirect,
  isNativeSsoClient,
} from '../../common/sso-clients.js';

/** base64url(SHA-256(verifier)) without padding: always 43 characters (RFC 7636, S256). */
const codeChallenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid code challenge');

export const createSsoCodeSchema = z
  .object({
    client: z.enum(ALL_SSO_CLIENTS),
    codeChallenge,
    /** Only for a desktop program: the loopback address its browser is sent back to. */
    redirectUri: z.string().max(64).optional(),
  })
  .strict()
  .refine((value) => isNativeSsoClient(value.client) || value.redirectUri === undefined, {
    // A web client's callback is fixed by its host, never taken from a request.
    path: ['redirectUri'],
    message: 'Not allowed for this client',
  })
  .refine((value) => !isNativeSsoClient(value.client) || isLoopbackRedirect(value.redirectUri), {
    path: ['redirectUri'],
    message: 'Must be http://127.0.0.1:<port>/callback',
  });
export type CreateSsoCodeInput = z.infer<typeof createSsoCodeSchema>;

export const exchangeSsoCodeSchema = z
  .object({
    client: z.enum(ALL_SSO_CLIENTS),
    /** 32 random bytes as base64url: 43 characters. */
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid code'),
    /** RFC 7636: 43–128 characters of the unreserved set. */
    codeVerifier: z.string().regex(/^[A-Za-z0-9\-._~]{43,128}$/, 'Invalid code verifier'),
    /**
     * A desktop program's redirect address, compared with the one stored with its code. Any
     * string is read, so a wrong one fails like every other bad exchange, with the same answer.
     */
    redirectUri: z.string().max(2048).optional(),
  })
  .strict();
export type ExchangeSsoCodeInput = z.infer<typeof exchangeSsoCodeSchema>;
