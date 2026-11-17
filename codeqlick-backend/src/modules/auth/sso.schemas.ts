import { z } from 'zod';
import { SSO_CLIENTS } from '../../common/sso-clients.js';

/** base64url(SHA-256(verifier)) without padding: always 43 characters (RFC 7636, S256). */
const codeChallenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid code challenge');

export const createSsoCodeSchema = z
  .object({
    client: z.enum(SSO_CLIENTS),
    codeChallenge,
  })
  .strict();
export type CreateSsoCodeInput = z.infer<typeof createSsoCodeSchema>;

export const exchangeSsoCodeSchema = z
  .object({
    client: z.enum(SSO_CLIENTS),
    /** 32 random bytes as base64url: 43 characters. */
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid code'),
    /** RFC 7636: 43–128 characters of the unreserved set. */
    codeVerifier: z.string().regex(/^[A-Za-z0-9\-._~]{43,128}$/, 'Invalid code verifier'),
  })
  .strict();
export type ExchangeSsoCodeInput = z.infer<typeof exchangeSsoCodeSchema>;
