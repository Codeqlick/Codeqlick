import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';

const slug = (min: number, max: number) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .min(min)
    .max(max)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits and single dashes');

export const teamSlugSchema = slug(3, 30);
export const projectSlugSchema = slug(3, 40);
const name = z.string().trim().min(1).max(60);

export const teamParamSchema = z.object({ team: teamSlugSchema });
export type TeamParam = z.infer<typeof teamParamSchema>;

export const termsSchema = z.object({
  acceptTerms: z.literal(true),
  termsVersion: z.string().min(1).max(20),
});
export type TermsInput = z.infer<typeof termsSchema>;

export const createTeamSchema = termsSchema.extend({ name, slug: teamSlugSchema });
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({ name });
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const inviteSchema = z.object({
  email: z.email().max(254).toLowerCase(),
  role: z.enum(['ADMIN', 'MEMBER']),
  locale: localeSchema.default('es'),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const inviteParamSchema = z.object({ team: teamSlugSchema, id: z.uuid() });
export type InviteParam = z.infer<typeof inviteParamSchema>;

export const inviteTokenParamSchema = z.object({ token: z.string().min(20).max(100) });
export type InviteTokenParam = z.infer<typeof inviteTokenParamSchema>;

export const memberParamSchema = z.object({ team: teamSlugSchema, userId: z.uuid() });
export type MemberParam = z.infer<typeof memberParamSchema>;

export const memberRoleSchema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'MEMBER']) });
export type MemberRoleInput = z.infer<typeof memberRoleSchema>;

export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  teamSlug: teamSlugSchema.optional(),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
});
export type CreateTokenInput = z.infer<typeof createTokenSchema>;

export const deviceStartSchema = z.object({
  clientName: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[\p{L}\p{N} ._@()-]+$/u, 'Letters, digits, spaces and . _ @ ( ) -'),
});
export type DeviceStartInput = z.infer<typeof deviceStartSchema>;

export const devicePollSchema = z.object({ deviceCode: z.string().min(20).max(100) });
export type DevicePollInput = z.infer<typeof devicePollSchema>;

export const userCodeParamSchema = z.object({
  userCode: z
    .string()
    .toUpperCase()
    .transform((value) => value.replace(/[^A-Z0-9]/g, ''))
    .pipe(z.string().length(8)),
});
export type UserCodeParam = z.infer<typeof userCodeParamSchema>;

export const deviceDecisionSchema = z.object({ approve: z.boolean() });
export type DeviceDecisionInput = z.infer<typeof deviceDecisionSchema>;

export const createProjectSchema = z.object({ name, slug: projectSlugSchema });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({ name });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const deploymentParamSchema = z.object({ id: z.uuid(), deploymentId: z.uuid() });
export type DeploymentParam = z.infer<typeof deploymentParamSchema>;

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );

/** The text fields of a deployment's multipart upload. */
export const deploymentFieldsSchema = z.object({
  target: z.enum(['preview', 'production']).default('preview'),
  message: optionalText(200),
  commit: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[0-9a-f]{4,40}$/, 'A commit hash')
      .optional(),
  ),
  branch: optionalText(100),
});
export type DeploymentFields = z.infer<typeof deploymentFieldsSchema>;

export const domainNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/\.+$/, ''))
  .pipe(
    z
      .string()
      .max(253)
      .regex(
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
        'A domain such as docs.example.com',
      ),
  );

export const createDomainSchema = z.object({ name: domainNameSchema });
export type CreateDomainInput = z.infer<typeof createDomainSchema>;

export const domainParamSchema = z.object({ id: z.uuid(), domainId: z.uuid() });
export type DomainParam = z.infer<typeof domainParamSchema>;

export const reportSchema = z.object({
  url: z.url().max(2048),
  reason: z.enum(['PHISHING', 'MALWARE', 'ILLEGAL', 'COPYRIGHT', 'SEXUAL', 'SPAM', 'OTHER']),
  details: z.string().trim().min(10).max(2000),
  email: z.email().max(254),
  website: z.string().max(0).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const adminListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  suspended: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListQuery = z.infer<typeof adminListSchema>;

export const reportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export const suspendSchema = z.object({ reason: z.string().trim().min(5).max(500) });
export type SuspendInput = z.infer<typeof suspendSchema>;

export const closeReportSchema = z.object({ note: z.string().trim().max(1000).optional() });
export type CloseReportInput = z.infer<typeof closeReportSchema>;

// ── Forms (phase 1b) ─────────────────────────────────────────────────────────────────────────

const recipientIds = z.array(z.uuid()).min(1).max(5);

export const createFormSchema = z.object({
  name: z.string().trim().min(1).max(60),
  notify: z.boolean().default(true),
  recipientIds,
});
export type CreateFormInput = z.infer<typeof createFormSchema>;

export const updateFormSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
  notify: z.boolean().optional(),
  recipientIds: recipientIds.optional(),
});
export type UpdateFormInput = z.infer<typeof updateFormSchema>;

export const formParamSchema = z.object({ id: z.uuid(), formId: z.uuid() });
export type FormParam = z.infer<typeof formParamSchema>;

export const submissionParamSchema = z.object({
  id: z.uuid(),
  formId: z.uuid(),
  submissionId: z.uuid(),
});
export type SubmissionParam = z.infer<typeof submissionParamSchema>;

export const submissionsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SubmissionsQuery = z.infer<typeof submissionsQuerySchema>;

export const formKeyParamSchema = z.object({ key: z.string().regex(/^cqf_[\w-]{20,30}$/) });
export type FormKeyParam = z.infer<typeof formKeyParamSchema>;

// ── Monitors and status pages (phase 1b) ─────────────────────────────────────────────────────

const alertIds = z.array(z.uuid()).min(1).max(10);

export const createMonitorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('HTTP'),
    name: z.string().trim().min(1).max(60),
    url: z.url().max(2048),
    projectId: z.uuid().optional(),
    alertIds,
  }),
  z.object({
    kind: z.literal('HEARTBEAT'),
    name: z.string().trim().min(1).max(60),
    periodMinutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60),
    graceMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    projectId: z.uuid().optional(),
    alertIds,
  }),
]);
export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;

export const updateMonitorSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
  url: z.url().max(2048).optional(),
  periodMinutes: z
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60)
    .optional(),
  graceMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  alertIds: alertIds.optional(),
});
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

export const heartbeatParamSchema = z.object({ key: z.string().regex(/^cqh_[\w-]{20,30}$/) });
export type HeartbeatParam = z.infer<typeof heartbeatParamSchema>;

export const heartbeatQuerySchema = z.object({ status: z.enum(['ok', 'fail']).optional() });
export type HeartbeatQuery = z.infer<typeof heartbeatQuerySchema>;

export const statusPageSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(80),
  intro: z.string().trim().max(500).optional(),
  items: z
    .array(z.object({ monitorId: z.uuid(), label: z.string().trim().min(1).max(60) }))
    .max(20),
});
export type StatusPageInput = z.infer<typeof statusPageSchema>;

export const statusTeamParamSchema = z.object({ team: teamSlugSchema });

// ── Website check API (phase 1b) ─────────────────────────────────────────────────────────────

export const runAuditSchema = z.object({
  url: z.url().max(2048),
  teamSlug: teamSlugSchema,
  locale: localeSchema.default('en'),
});
export type RunAuditInput = z.infer<typeof runAuditSchema>;
