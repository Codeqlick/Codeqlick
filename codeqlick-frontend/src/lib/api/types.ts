/**
 * Types from the API contract — docs/architecture.md, section 5 (v1).
 * Keep in sync with the backend; the HTTP API is the only contract between the two apps.
 */

export type Locale = 'en' | 'es';

export type Role = 'ADMIN' | 'CLIENT';

export type AuthUser = { id: string; email: string; name: string; role: Role };

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PublishStatus = 'DRAFT' | 'PUBLISHED';

/** A blog tag as the public site shows it, named in the requested language. */
export type PublicTag = { slug: string; name: string };

export type PostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: string;
  tags: PublicTag[];
};

/** `GET /admin/tags`. */
export type AdminTag = {
  id: string;
  slug: string;
  nameEn: string;
  nameEs: string;
  postCount: number;
};

export type TagInput = { slug: string; nameEn: string; nameEs: string };

export type PostDetail = PostSummary & { content: string; locales: Locale[] };

export type Translation<T> = { locale: Locale } & T;

export type PostTranslationFields = { title: string; excerpt: string; content: string };

export type PostInput = {
  slug: string;
  status: PublishStatus;
  /** ISO instant; in the future it schedules the post. `null`: now when published. */
  publishedAt?: string | null;
  tagIds?: string[];
  coverImageUrl?: string | null;
  translations: Translation<PostTranslationFields>[]; // at least 'en'
};

export type AdminPost = Omit<PostInput, 'coverImageUrl' | 'tagIds'> & {
  id: string;
  tagIds: string[];
  coverImageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Testimonial = { quote: string; author: string; role: string | null };

export type PortfolioSummary = {
  slug: string;
  title: string;
  summary: string;
  clientName: string | null;
  coverImageUrl: string | null;
  technologies: string[];
  /** Service lines the work covered (keys of components/content/services). */
  services: ServiceKey[];
  testimonial: Testimonial | null;
};

export type ServiceKey = 'web' | 'custom' | 'mobile' | 'design' | 'consulting' | 'support';

/** `GET /portfolio/filters`: what the case study list can be filtered by, with counts. */
export type PortfolioFilters = {
  technologies: { name: string; count: number }[];
  services: { key: ServiceKey; count: number }[];
};

export type PortfolioDetail = PortfolioSummary & {
  content: string;
  projectUrl: string | null;
  locales: Locale[];
};

export type PortfolioTranslationFields = {
  title: string;
  summary: string;
  content: string;
  testimonialQuote?: string | null;
  testimonialRole?: string | null;
};

export type PortfolioInput = {
  slug: string;
  status: PublishStatus;
  /** ISO instant; in the future it schedules the case study. `null`: now when published. */
  publishedAt?: string | null;
  clientName?: string | null;
  /** Who gave the testimonial; its quote and role are per translation. */
  testimonialAuthor?: string | null;
  projectUrl?: string | null;
  coverImageUrl?: string | null;
  technologies: string[];
  services: ServiceKey[];
  sortOrder: number;
  translations: Translation<PortfolioTranslationFields>[];
};

/**
 * Admin view of a portfolio item. Section 5 does not spell this shape out; it mirrors AdminPost
 * (the stored input plus id and timestamps).
 */
export type AdminPortfolioItem = Omit<
  PortfolioInput,
  'clientName' | 'testimonialAuthor' | 'projectUrl' | 'coverImageUrl'
> & {
  id: string;
  clientName: string | null;
  testimonialAuthor: string | null;
  projectUrl: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const PROJECT_PHASES = [
  'DISCOVERY',
  'DESIGN',
  'DEVELOPMENT',
  'QA',
  'LAUNCHED',
  'SUPPORT',
  'ON_HOLD',
] as const;

export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export type UpdateComment = {
  id: string;
  body: string;
  createdAt: string;
  /** `team`: written by Codeqlick; otherwise by the client. */
  author: { name: string; team: boolean };
};

export type ProjectUpdate = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
  approvalRequested: boolean;
  approvedAt: string | null;
  approvedBy: { name: string } | null;
  comments: UpdateComment[];
  /** Set on releases: the version, where it went and its address. */
  release: { version: string; environment: ReleaseEnvironment; url: string | null } | null;
};

export const RELEASE_ENVIRONMENTS = ['STAGING', 'PRODUCTION'] as const;
export type ReleaseEnvironment = (typeof RELEASE_ENVIRONMENTS)[number];

export type ProjectMilestone = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
};

export type MilestoneInput = {
  title: string;
  description: string | null;
  dueDate: string | null;
};

export type ProjectFile = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
};

export type ClientProject = {
  id: string;
  name: string;
  description: string | null;
  phase: ProjectPhase;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  stagingUrl: string | null;
  productionUrl: string | null;
  /** The client sees the hours logged on it. */
  showHours: boolean;
  /** When the current release key (for deploy pipelines) was made; null without one. */
  releaseKeyCreatedAt: string | null;
  client: { id: string; name: string; email: string };
  updates?: ProjectUpdate[];
  files?: ProjectFile[];
  milestones?: ProjectMilestone[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  clientId: string;
  name: string;
  description?: string | null;
  phase: ProjectPhase;
  progress: number;
  startDate?: string | null;
  dueDate?: string | null;
  stagingUrl?: string | null;
  productionUrl?: string | null;
  showHours?: boolean;
};

/** The sales process: first contact, talking, discovery call, proposal, then won or lost. */
export const LEAD_STATUSES = ['NEW', 'TALKING', 'CALL', 'PROPOSAL', 'WON', 'LOST', 'SPAM'] as const;

export const LOST_REASONS = [
  'PRICE',
  'NO_RESPONSE',
  'NOT_A_FIT',
  'CHOSE_OTHER',
  'TIMING',
  'OTHER',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Lead = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  budget: string | null;
  message: string;
  locale: Locale;
  status: LeadStatus;
  notes: string | null;
  lostReason: LostReason | null;
  /** `yyyy-mm-dd`: when to get back to them. */
  followUpOn: string | null;
  /** The client account it became ("Convert to client"). */
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** An email answer sent to a lead from the admin panel. */
export type LeadReply = {
  id: string;
  subject: string;
  body: string;
  author: { name: string };
  createdAt: string;
};

export type LeadInput = {
  name: string;
  email: string;
  company?: string;
  budget?: string;
  message: string;
  locale: Locale;
  website?: string;
};

/** `locale`: language of the emails the platform sends the user. */
export type AdminUser = AuthUser & {
  isActive: boolean;
  locale: 'en' | 'es';
  /** Clients: the Monday summary of their projects. */
  weeklyDigest: boolean;
  createdAt: string;
};

/** `GET /auth/preferences`: the caller's email preferences. */
export type Preferences = { weeklyDigest: boolean };

/** Without `password`, the user is emailed a link to choose one. `locale`: language of their emails. */
export type UserInput = {
  email: string;
  name: string;
  password?: string;
  role: Role;
  locale: 'en' | 'es';
};

/** `invitationSent` is only there when a welcome email was due (no password given). */
export type CreatedUser = AdminUser & { invitationSent?: boolean };

export type UserPatch = {
  name?: string;
  password?: string;
  isActive?: boolean;
  role?: Role;
  locale?: 'en' | 'es';
  weeklyDigest?: boolean;
};

export type AdminStats = {
  leads: {
    new: number;
    total: number;
    /** Why lost leads didn't go ahead (`null`: no reason given). */
    lostReasons: { reason: LostReason | null; count: number }[];
  };
  posts: { published: number; drafts: number; scheduled: number };
  portfolio: { published: number };
  projects: { active: number };
  clients: number;
  /** Support requests not resolved or closed yet. */
  support: { active: number };
  /** Proposals sent and waiting for the client's answer. */
  proposals: { sent: number };
  /** Draft updates waiting for the team's review. */
  drafts: { pending: number };
};

/** `GET /admin/stats/timeline`: one entry per month, oldest first, months as `yyyy-mm`. */
export type AdminTimeline = {
  months: {
    month: string;
    leads: number;
    leadsWon: number;
    posts: number;
    caseStudies: number;
  }[];
};

/** One entry of the RFC 9457 `errors` extension used by the API for validation failures. */
export type ProblemFieldError = { path: string; message: string };

export type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: ProblemFieldError[];
  requestId?: string;
};

/** Result of `POST /admin/media`. The image is served by the website at `/media/<filename>`. */
export type UploadedMedia = { filename: string; contentType: string; size: number };

/** Content that uses an uploaded image, as a cover or inside its Markdown. */
export type MediaUsage = { type: 'post' | 'portfolio'; id: string; slug: string };

/** One row of `GET /admin/media`. */
export type MediaItem = UploadedMedia & { createdAt: string; usedBy: MediaUsage[] };

/** `POST /auth/login` when the account has two-step verification on: the code comes next. */
export type TwoFactorChallenge = { twoFactorRequired: true; challengeToken: string };

export type LoginResult = AuthTokens | TwoFactorChallenge;

export type TwoFactorStatus = {
  enabled: boolean;
  recoveryCodesLeft: number;
  /** The account can't use its area without it (admins, when the server requires it). */
  required: boolean;
};

/** A signed-in device (`GET /auth/sessions`). `id` is stable across token refreshes. */
export type ActiveSession = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastActiveAt: string;
  current: boolean;
};

export type TwoFactorSetup = { secret: string; otpauthUrl: string };

/** What an activity log entry can be about (`GET /admin/activity?targetType=`). */
export const ACTIVITY_TARGETS = [
  'post',
  'portfolio',
  'project',
  'lead',
  'user',
  'media',
  'tag',
  'support',
  'proposal',
  'account',
] as const;
export type ActivityTarget = (typeof ACTIVITY_TARGETS)[number];

/** One change in the activity log. `action` is `<target>.<verb>`, e.g. `post.published`. */
export type ActivityEntry = {
  id: string;
  action: string;
  actor: { id: string | null; name: string };
  target: { type: string; id: string | null; label: string | null };
  details: Record<string, unknown> | null;
  createdAt: string;
};

/** `GET /admin/stats/visits`: the public site's numbers from Umami. */
export type SiteVisits = {
  /** False when analytics isn't set up (development). */
  enabled: boolean;
  /** False when Umami didn't answer. */
  available: boolean;
  days: number;
  totals: {
    visitors: number;
    visits: number;
    pageviews: number;
    /** 0–1 */
    bounceRate: number;
    avgVisitSeconds: number;
  };
  previousVisitors: number;
  daily: { date: string; pageviews: number; visitors: number }[];
  topPages: { path: string; visitors: number }[];
  referrers: { source: string; visitors: number }[];
  countries: { code: string; visitors: number }[];
  contactsSent: number;
};

/** `GET /admin/saved-replies`: a reusable text; `{name}` and `{project}` are filled in on insert. */
export type SavedReply = { id: string; title: string; body: string; updatedAt: string };

export const TICKET_TYPES = ['BUG', 'CHANGE', 'QUESTION'] as const;
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CLIENT',
  'RESOLVED',
  'CLOSED',
] as const;
export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** A support request (`/portal/tickets`, `/admin/tickets`). */
export type Ticket = {
  id: string;
  number: number;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  client: { id: string; name: string; email: string };
  project: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type TicketMessage = {
  id: string;
  body: string;
  createdAt: string;
  /** `team`: written by Codeqlick; otherwise by the client. */
  author: { name: string; team: boolean };
};

export type TicketFile = ProjectFile & { author: { name: string; team: boolean } };

export type TicketDetail = Ticket & {
  messages: TicketMessage[];
  files: TicketFile[];
  /** Project tasks made from the request. */
  tasks: { id: string; title: string; status: TaskStatus; project: { id: string; name: string } }[];
};

export const PROPOSAL_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** A line of a proposal; amounts in cents. */
export type ProposalItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

/** A proposal or quote (`/portal/proposals`, `/admin/proposals`); amounts in cents. */
export type Proposal = {
  id: string;
  number: number;
  title: string;
  summary: string;
  terms: string | null;
  currency: string;
  validUntil: string | null;
  status: ProposalStatus;
  /** Sent and past its last valid day: it can't be accepted any more. */
  expired: boolean;
  sentAt: string | null;
  respondedAt: string | null;
  acceptedName: string | null;
  declineReason: string | null;
  client: { id: string; name: string; email: string };
  project: { id: string; name: string } | null;
  items: ProposalItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
};

export type ProposalInput = {
  title: string;
  summary: string;
  terms: string | null;
  validUntil: string | null;
  projectId: string | null;
  items: { description: string; quantity: number; unitPrice: number }[];
};

/** Time logged on a client project (`/admin/projects/:id/time`). */
export type TimeEntry = {
  id: string;
  /** `yyyy-mm-dd`. */
  date: string;
  minutes: number;
  description: string;
  author: { name: string };
  project: { id: string; name: string; client: { id: string; name: string } };
};

/** A project's hours: total, per month (newest first) and the entries (newest first). */
export type ProjectTime = {
  totalMinutes: number;
  months: { month: string; minutes: number }[];
  entries: TimeEntry[];
};

/** Every project's hours in one month (`/admin/time`). */
export type MonthTime = {
  month: string;
  totalMinutes: number;
  projects: { id: string; name: string; client: { id: string; name: string }; minutes: number }[];
  entries: TimeEntry[];
};

/** An update sent with a project's release key, waiting for the team's review. */
export type UpdateDraft = {
  id: string;
  project: { id: string; name: string };
  title: string;
  body: string;
  version: string | null;
  environment: ReleaseEnvironment | null;
  url: string | null;
  createdAt: string;
};

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Work on a client project (`/admin/projects/:id/tasks`); open first, done last. */
export type ProjectTask = {
  id: string;
  title: string;
  /** For the team; absent in the client's view. */
  description?: string | null;
  status: TaskStatus;
  /** The support request it came from. */
  ticket: { id: string; number: number } | null;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
};
