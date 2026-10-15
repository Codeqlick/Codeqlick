import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).optional();
const choice = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).or(z.literal('')).optional();

/**
 * The questionnaire's answers. Every question is optional so the client can save as they go;
 * the portal asks for the essential ones before sending it.
 */
export const briefAnswersSchema = z
  .object({
    /** What the business does. */
    business: text(3000),
    /** What the project must achieve, and how success will be measured. */
    goals: text(3000),
    success: text(2000),
    /** Who will use it. */
    audience: text(3000),
    mustHave: text(5000),
    niceToHave: text(5000),
    /** Sites or apps they like, and what they like about them. */
    references: text(3000),
    brandStatus: choice(['none', 'partial', 'complete'] as const),
    brandColors: text(500),
    brandTone: choice(['formal', 'friendly', 'technical', 'playful'] as const),
    /** A link to the logo and brand material (Drive, Dropbox...). */
    brandAssetsUrl: text(500),
    /** Who writes the texts and provides the images. */
    content: choice(['client', 'codeqlick', 'both'] as const),
    /** The domain they have or want. */
    domain: text(300),
    /** Services and accounts the project needs (payments, email, analytics...). */
    services: text(2000),
    /** `yyyy-mm-dd` or empty. */
    deadline: z.iso.date().or(z.literal('')).optional(),
    deadlineReason: text(1000),
    other: text(3000),
  })
  .strict();
export type BriefAnswers = z.infer<typeof briefAnswersSchema>;

/** The answers that must be there to send it. */
export const REQUIRED_TO_SUBMIT = ['business', 'goals', 'audience', 'mustHave'] as const;

export const saveBriefSchema = z
  .object({
    answers: briefAnswersSchema,
    /** `true`: send it to the team (the essential answers must be there). */
    submit: z.boolean().default(false),
  })
  .strict();
export type SaveBriefInput = z.infer<typeof saveBriefSchema>;
