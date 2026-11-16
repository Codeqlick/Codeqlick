import { z } from 'zod';

/** Passkeys (architecture 4.3, decision 104): the browser's WebAuthn responses, as JSON. */

/** base64url without padding, as browsers (and @simplewebauthn/browser) send it. */
const base64url = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/);

const clientExtensionResults = z.record(z.string(), z.unknown()).default({});
const authenticatorAttachment = z.enum(['platform', 'cross-platform']).optional();

/** What `navigator.credentials.create()` answered (an attestation). */
export const registrationResponseSchema = z.object({
  id: base64url(1024),
  rawId: base64url(1024),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: base64url(8192),
    attestationObject: base64url(65_536),
    authenticatorData: base64url(65_536).optional(),
    transports: z.array(z.string().max(32)).max(10).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: base64url(16_384).optional(),
  }),
  authenticatorAttachment,
  clientExtensionResults,
});

/** What `navigator.credentials.get()` answered (an assertion). */
export const authenticationResponseSchema = z.object({
  id: base64url(1024),
  rawId: base64url(1024),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: base64url(8192),
    authenticatorData: base64url(65_536),
    // Post-quantum keys (ML-DSA, which Chrome already offers) sign with up to ~4.6 KB.
    signature: base64url(16_384),
    userHandle: base64url(512).optional(),
  }),
  authenticatorAttachment,
  clientExtensionResults,
});

export const passkeyNameSchema = z.string().trim().min(1).max(40);

export const passkeyPasswordSchema = z.object({ password: z.string().min(1).max(1024) }).strict();
export type PasskeyPasswordInput = z.infer<typeof passkeyPasswordSchema>;

export const registerPasskeySchema = z
  .object({ response: registrationResponseSchema, name: passkeyNameSchema.optional() })
  .strict();
export type RegisterPasskeyInput = z.infer<typeof registerPasskeySchema>;

export const passkeyLoginSchema = z
  .object({ challengeId: z.uuid(), response: authenticationResponseSchema })
  .strict();
export type PasskeyLoginInput = z.infer<typeof passkeyLoginSchema>;

export const renamePasskeySchema = z.object({ name: passkeyNameSchema }).strict();
export type RenamePasskeyInput = z.infer<typeof renamePasskeySchema>;
