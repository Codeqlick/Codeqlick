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

export type PostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: string;
};

export type PostDetail = PostSummary & { content: string; locales: Locale[] };

export type Translation<T> = { locale: Locale } & T;

export type PostTranslationFields = { title: string; excerpt: string; content: string };

export type PostInput = {
  slug: string;
  status: PublishStatus;
  coverImageUrl?: string | null;
  translations: Translation<PostTranslationFields>[]; // at least 'en'
};

export type AdminPost = Omit<PostInput, 'coverImageUrl'> & {
  id: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioSummary = {
  slug: string;
  title: string;
  summary: string;
  clientName: string | null;
  coverImageUrl: string | null;
  technologies: string[];
};

export type PortfolioDetail = PortfolioSummary & {
  content: string;
  projectUrl: string | null;
  locales: Locale[];
};

export type PortfolioTranslationFields = { title: string; summary: string; content: string };

export type PortfolioInput = {
  slug: string;
  status: PublishStatus;
  clientName?: string | null;
  projectUrl?: string | null;
  coverImageUrl?: string | null;
  technologies: string[];
  sortOrder: number;
  translations: Translation<PortfolioTranslationFields>[];
};

/**
 * Admin view of a portfolio item. Section 5 does not spell this shape out; it mirrors AdminPost
 * (the stored input plus id and timestamps).
 */
export type AdminPortfolioItem = Omit<
  PortfolioInput,
  'clientName' | 'projectUrl' | 'coverImageUrl'
> & {
  id: string;
  clientName: string | null;
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

export type ProjectUpdate = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
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
  client: { id: string; name: string; email: string };
  updates?: ProjectUpdate[];
  files?: ProjectFile[];
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
};

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST', 'ARCHIVED'] as const;

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
  createdAt: string;
  updatedAt: string;
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

export type AdminUser = AuthUser & { isActive: boolean; createdAt: string };

export type UserInput = { email: string; name: string; password: string; role: Role };

export type UserPatch = { name?: string; password?: string; isActive?: boolean; role?: Role };

export type AdminStats = {
  leads: { new: number; total: number };
  posts: { published: number; drafts: number };
  portfolio: { published: number };
  projects: { active: number };
  clients: number;
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

export type TwoFactorStatus = { enabled: boolean; recoveryCodesLeft: number };

/** A signed-in device (`GET /auth/sessions`). `id` is stable across token refreshes. */
export type ActiveSession = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastActiveAt: string;
  current: boolean;
};

export type TwoFactorSetup = { secret: string; otpauthUrl: string };
