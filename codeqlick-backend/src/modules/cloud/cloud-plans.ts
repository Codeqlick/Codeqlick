import { WEBAPPS } from '../../common/webapps.js';

/** The Cloud terms' current version: people accept it to create or join a team. */
export const CLOUD_TERMS_VERSION = '2026-11-13';

export interface CloudLimits {
  teamsOwned: number;
  teamsJoined: number;
  projectsPerTeam: number;
  storageBytesPerTeam: number;
  deploymentBytes: number;
  deploymentFiles: number;
  uploadBytes: number;
  deploymentsPerHour: number;
  domainsPerProject: number;
  membersPerTeam: number;
  tokensPerPerson: number;
  formsPerProject: number;
  formSubmissionsPerMonth: number;
  monitorsPerTeam: number;
  auditsPerHour: number;
  buildsPerMonth: number;
  buildMinutes: number;
  envVarsPerProject: number;
  /** Build notification channels per project (decision 43). */
  notifyChannelsPerProject: number;
  /** Web analytics events a Madrid calendar month (decision 44). */
  analyticsEventsPerMonth: number;
  /** Key-value store (decision 45). */
  kvKeysPerProject: number;
  kvBytesPerProject: number;
  /** Managed databases (decision 47). */
  databasesPerProject: number;
  databaseBytes: number;
  databaseConnections: number;
  /** Object storage (decision 48). */
  bucketsPerProject: number;
  bucketBytes: number;
  bucketObjects: number;
  /** `codeqlick.json` (decision 52): redirects plus rewrites, header rules and the file's size. */
  configRules: number;
  configHeaderRules: number;
  configBytes: number;
}

const MB = 1024 * 1024;

/** Limits of each plan (architecture 4.13). Only FREE exists until paid plans (phase 2). */
export const CLOUD_PLANS: Record<'FREE' | 'PRO', CloudLimits> = {
  FREE: {
    teamsOwned: 3,
    teamsJoined: 10,
    projectsPerTeam: 10,
    storageBytesPerTeam: 1024 * MB,
    deploymentBytes: 100 * MB,
    deploymentFiles: 10_000,
    uploadBytes: 50 * MB,
    deploymentsPerHour: 30,
    domainsPerProject: 5,
    membersPerTeam: 10,
    tokensPerPerson: 20,
    formsPerProject: 3,
    formSubmissionsPerMonth: 1000,
    monitorsPerTeam: 10,
    auditsPerHour: 20,
    buildsPerMonth: 200,
    buildMinutes: 15,
    envVarsPerProject: 50,
    notifyChannelsPerProject: 5,
    analyticsEventsPerMonth: 50_000,
    kvKeysPerProject: 1000,
    kvBytesPerProject: 10 * MB,
    databasesPerProject: 1,
    databaseBytes: 256 * MB,
    databaseConnections: 5,
    bucketsPerProject: 2,
    bucketBytes: 1024 * MB,
    bucketObjects: 100_000,
    configRules: 100,
    configHeaderRules: 30,
    configBytes: 64 * 1024,
  },
  PRO: {
    teamsOwned: 3,
    teamsJoined: 10,
    projectsPerTeam: 50,
    storageBytesPerTeam: 20 * 1024 * MB,
    deploymentBytes: 500 * MB,
    deploymentFiles: 50_000,
    uploadBytes: 50 * MB,
    deploymentsPerHour: 120,
    domainsPerProject: 20,
    membersPerTeam: 50,
    tokensPerPerson: 20,
    formsPerProject: 20,
    formSubmissionsPerMonth: 20000,
    monitorsPerTeam: 50,
    auditsPerHour: 200,
    buildsPerMonth: 3000,
    buildMinutes: 30,
    envVarsPerProject: 200,
    notifyChannelsPerProject: 20,
    analyticsEventsPerMonth: 1_000_000,
    kvKeysPerProject: 100_000,
    kvBytesPerProject: 1024 * MB,
    databasesPerProject: 5,
    databaseBytes: 10 * 1024 * MB,
    databaseConnections: 20,
    bucketsPerProject: 10,
    bucketBytes: 50 * 1024 * MB,
    bucketObjects: 1_000_000,
    configRules: 2000,
    configHeaderRules: 200,
    configBytes: 256 * 1024,
  },
};

/** Limits that don't depend on a team (the person's, and the upload the API accepts at all). */
export const FREE = CLOUD_PLANS.FREE;
/** The largest bundle any plan uploads: what the upload interceptor accepts. */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(CLOUD_PLANS).map((p) => p.uploadBytes));

/** Deployments kept per project besides production. */
export const KEPT_DEPLOYMENTS = 20;
/** A deleted project's address stays taken this long. */
export const DELETED_PROJECT_DAYS = 30;
export const EVENTS_DAYS = 365;
export const INVITE_DAYS = 7;
export const DEVICE_CODE_MINUTES = 10;
export const DEVICE_POLL_SECONDS = 5;
export const CLI_TOKEN_DAYS = 90;
/** Form submissions are kept this long (decision 37). */
export const FORM_SUBMISSION_DAYS = 180;
/** Analytics events are kept this long (decision 44). */
export const ANALYTICS_DAYS = 365;
/** The largest value of the key-value store, serialised (decision 45). */
export const KV_VALUE_BYTES = 64 * 1024;
/** Access keys per bucket (decision 48). */
export const KEYS_PER_BUCKET = 10;

/** Project addresses nobody may take. */
export const RESERVED_SLUGS = new Set<string>([
  'www',
  'api',
  'app',
  'admin',
  'cloud',
  'console',
  'docs',
  'status',
  'mail',
  'cdn',
  'static',
  'assets',
  'codeqlick',
  // Managed databases and object storage answer at pg.<domain> and s3.<domain> (decisions 47, 48).
  'pg',
  's3',
  ...WEBAPPS,
]);
