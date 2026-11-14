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

// ── Builds from Git (phase 2) ────────────────────────────────────────────────────────────────

/** A folder inside the repository: relative, no `..`, no leading slash. */
const relativeDir = z
  .string()
  .trim()
  .max(200)
  .transform((value) => value.replace(/^\.?\/+|\/+$/g, ''))
  .pipe(
    z
      .string()
      .refine(
        (value) => !value.split('/').some((part) => part === '..' || part === '.'),
        'A folder inside the repository',
      )
      .refine((value) => /^[\w@.+\-/ ]*$/.test(value), 'Letters, digits and . _ - / only'),
  );
const command = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((value) => !/[\r\n]/.test(value), 'One line');

export const installUrlQuerySchema = z.object({
  teamSlug: teamSlugSchema,
  /** The project to come back to after installing. */
  projectSlug: projectSlugSchema.optional(),
});
export type InstallUrlQuery = z.infer<typeof installUrlQuerySchema>;

export const linkInstallationSchema = z.object({
  installationId: z.coerce.number().int().positive(),
  code: z.string().min(1).max(200),
  state: z.string().min(10).max(1000),
});
export type LinkInstallationInput = z.infer<typeof linkInstallationSchema>;

export const reposQuerySchema = z.object({ installationId: z.coerce.number().int().positive() });
export type ReposQuery = z.infer<typeof reposQuerySchema>;

export const gitSettingsSchema = z.object({
  installationId: z.coerce.number().int().positive(),
  repoId: z.coerce.number().int().positive(),
  branch: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[\w./-]+$/, 'A branch name'),
  rootDir: relativeDir.optional(),
  installCommand: command.optional(),
  buildCommand: command.optional(),
  outputDir: relativeDir.optional(),
  nodeVersion: z.enum(['20', '22', '24']).optional(),
  buildBranches: z.boolean().optional(),
  buildPullRequests: z.boolean().optional(),
});
export type GitSettingsInput = z.infer<typeof gitSettingsSchema>;

export const envVarSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[A-Z_][A-Z0-9_]{0,63}$/, 'Upper-case letters, digits and _'),
    value: z.string().max(4096),
    production: z.boolean(),
    preview: z.boolean(),
  })
  .refine((v) => v.production || v.preview, {
    message: 'For production, previews or both',
    path: ['production'],
  });
export type EnvVarInput = z.infer<typeof envVarSchema>;

export const envKeyQuerySchema = z.object({ key: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/) });
export type EnvKeyQuery = z.infer<typeof envKeyQuerySchema>;

export const manualBuildSchema = z.object({
  branch: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[\w./-]+$/)
    .optional(),
});
export type ManualBuildInput = z.infer<typeof manualBuildSchema>;

export const buildParamSchema = z.object({
  id: z.uuid(),
  number: z.coerce.number().int().positive(),
});
export type BuildParam = z.infer<typeof buildParamSchema>;

export const logQuerySchema = z.object({ after: z.coerce.number().int().min(0).default(0) });
export type LogQuery = z.infer<typeof logQuerySchema>;

export const claimSchema = z.object({ builder: z.string().trim().min(1).max(60) });
export type ClaimInput = z.infer<typeof claimSchema>;

export const builderBuildParamSchema = z.object({ id: z.uuid() });
export type BuilderBuildParam = z.infer<typeof builderBuildParamSchema>;

export const finishSchema = z.object({
  status: z.enum(['succeeded', 'failed']),
  error: z.string().max(500).optional(),
});
export type FinishInput = z.infer<typeof finishSchema>;

// ── Build notifications (decision 43) ────────────────────────────────────────────────────────

const channelName = z.string().trim().min(1).max(60);
const channelUrl = z.url().max(2048);
const channelRecipients = z.array(z.uuid()).min(1).max(10);
const channelEvents = {
  buildFailed: z.boolean().optional(),
  buildSucceeded: z.boolean().optional(),
  previews: z.boolean().optional(),
  // Form submissions (decision 63): Slack, Discord and webhooks only, checked by the service.
  formSubmitted: z.boolean().optional(),
  formIds: z.array(z.uuid()).max(20).optional(),
  locale: localeSchema.optional(),
};

export const createChannelSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('EMAIL'),
    name: channelName,
    recipientIds: channelRecipients,
    ...channelEvents,
  }),
  z.object({
    kind: z.enum(['SLACK', 'DISCORD', 'WEBHOOK']),
    name: channelName,
    url: channelUrl,
    ...channelEvents,
  }),
]);
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: channelName.optional(),
  enabled: z.boolean().optional(),
  url: channelUrl.optional(),
  recipientIds: channelRecipients.optional(),
  ...channelEvents,
});
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const channelParamSchema = z.object({ id: z.uuid(), channelId: z.uuid() });
export type ChannelParam = z.infer<typeof channelParamSchema>;

/** "Send a test": a sample build (the default) or a sample form submission. No body is a build. */
export const testChannelSchema = z
  .object({ event: z.enum(['build', 'form']).default('build') })
  .default({ event: 'build' });
export type TestChannelInput = z.infer<typeof testChannelSchema>;

// ── Web analytics (architecture 4.13 "Web analytics", decision 44) ──────────────────────────

export const analyticsQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d', '90d', '365d']).default('7d'),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const analyticsSwitchSchema = z.object({ enabled: z.boolean() });
export type AnalyticsSwitchInput = z.infer<typeof analyticsSwitchSchema>;

// ── Key-value store (architecture 4.13 "Key-value store", decision 45) ──────────────────────

export const kvKeySchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Letters, digits, ".", "_", "-" and ":"');

export const kvParamSchema = z.object({ id: z.uuid(), key: kvKeySchema });
export type KvParam = z.infer<typeof kvParamSchema>;

export const kvPublicParamSchema = z.object({ slug: projectSlugSchema, key: kvKeySchema });
export type KvPublicParam = z.infer<typeof kvPublicParamSchema>;

export const kvListQuerySchema = z.object({
  prefix: z.string().max(256).optional(),
  cursor: kvKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type KvListQuery = z.infer<typeof kvListQuerySchema>;

const kvTtl = z
  .number()
  .int()
  .min(1)
  .max(365 * 86_400)
  .optional();

export const kvPutSchema = z.object({ value: z.json(), ttl: kvTtl });
export type KvPutInput = z.infer<typeof kvPutSchema>;

export const kvIncrSchema = z.object({
  by: z.number().int().min(-1e12).max(1e12).default(1),
  ttl: kvTtl,
});
export type KvIncrInput = z.infer<typeof kvIncrSchema>;

// ── Plans and billing (architecture 4.13 "Plans and billing", decision 46) ─────────────────

export const billingLinkSchema = z.object({ locale: localeSchema.default('en') });
export type BillingLinkInput = z.infer<typeof billingLinkSchema>;

// ── Managed databases (architecture 4.13 "Databases", decision 47) ──────────────────────────

export const createDatabaseSchema = z.object({ name: z.string().trim().min(1).max(40) });
export type CreateDatabaseInput = z.infer<typeof createDatabaseSchema>;

export const databaseParamSchema = z.object({ id: z.uuid(), databaseId: z.uuid() });
export type DatabaseParam = z.infer<typeof databaseParamSchema>;

// ── Object storage (architecture 4.13 "Object storage", decision 48) ────────────────────────

export const createBucketSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Lowercase letters, digits and dashes'),
});
export type CreateBucketInput = z.infer<typeof createBucketSchema>;

export const bucketParamSchema = z.object({ id: z.uuid(), bucketId: z.uuid() });
export type BucketParam = z.infer<typeof bucketParamSchema>;

export const bucketKeyParamSchema = bucketParamSchema.extend({ keyId: z.uuid() });
export type BucketKeyParam = z.infer<typeof bucketKeyParamSchema>;

export const createBucketKeySchema = z.object({
  name: z.string().trim().min(1).max(60),
  write: z.boolean().default(false),
});
export type CreateBucketKeyInput = z.infer<typeof createBucketKeySchema>;
