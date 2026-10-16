import { z } from 'zod';

export const createCredentialSchema = z
  .object({
    /** What it is: "Hosting (OVH)", "Dominio", "Cuenta de Stripe". */
    label: z.string().trim().min(1).max(120),
    url: z.url().max(500).or(z.literal('')).optional(),
    username: z.string().trim().max(200).optional(),
    /** The password, token or key. */
    secret: z.string().min(1).max(5000),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;

export const credentialParamSchema = z.object({ id: z.uuid(), credentialId: z.uuid() });
export type CredentialParam = z.infer<typeof credentialParamSchema>;
