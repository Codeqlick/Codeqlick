/*
 * The cut-over's data cleanup (architecture 4.18, "Cut-over and data cleanup", decision 127).
 * Production holds only test data in the 18+ apps and nothing is migrated: the 18+ data of
 * CODEQLICK accounts is deleted, with the uploaded files. Run once, after the release of PR C:
 *
 *   docker compose exec api node dist/scripts/neoqlick-cleanup.js                 # dry run
 *   docker compose exec api node dist/scripts/neoqlick-cleanup.js --apply
 *   docker compose exec api node dist/scripts/neoqlick-cleanup.js --apply --delete-app-accounts
 *
 * Without `--apply` it only counts. It is idempotent (a second run finds nothing). It deletes every
 * row of the 18+ tables, so it refuses `--apply` once a NEOQLICK account has 18+ data (the apps
 * are in use): run it before that, or pass `--force` knowing what it deletes. The script and its
 * test are removed in a later PR once the cut-over is done.
 */
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { NEOQLICK_APPS } from '../common/webapps.js';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import { appWhere, CLIENT_WHERE } from '../modules/users/account-kind.js';

/** The `ActivityLog.targetType` of the 18+ apps' moderation (the action's first segment). */
export const ADULT_ACTIVITY_TARGETS = ['adult', 'cruising', 'swipe', 'videochat'] as const;

/** Tables of the 18+ apps by their name's prefix (Cruising*, Swipe*, Videochat*, Adult*). */
const ADULT_TABLE_PATTERN = '^(cruising|swipe|videochat|adult)_[a-z0-9_]+$';

export interface CleanupOptions {
  /** Delete for real; without it nothing is changed. */
  apply: boolean;
  /** With `apply`: also delete the CODEQLICK accounts that exist only to use the 18+ apps. */
  deleteAppAccounts: boolean;
  /** With `apply`: go on even when NEOQLICK accounts have 18+ data (which is deleted too). */
  force?: boolean;
}

export interface CleanupReport {
  applied: boolean;
  /** Rows per 18+ table (before the deletion). */
  tables: Record<string, number>;
  rows: number;
  /** 18+ rows that belong to NEOQLICK accounts: the apps are in use (`apply` refuses). */
  neoqlickRows: number;
  activityLogs: number;
  /** Files under the three upload folders (before the deletion). */
  files: number;
  /** CODEQLICK accounts that exist only to use the apps. */
  appAccounts: { id: string; email: string }[];
  appAccountsDeleted: number;
  /** Accounts that stay and lose their `signupApp` of an 18+ app. */
  signupAppsCleared: number;
}

/** Every file under `dir`, recursively (zero when it doesn't exist). */
async function countFiles(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    total += entry.isDirectory() ? await countFiles(join(dir, entry.name)) : 1;
  }
  return total;
}

/** Empties `dir` and keeps the folder itself. */
async function emptyDir(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(entries.map((name) => rm(join(dir, name), { recursive: true, force: true })));
}

/**
 * How many 18+ rows reference an account of `realm`, found through the foreign keys from the 18+
 * tables to `users` (so no table is missed). The integrity rule of architecture 4.18 is that this
 * is zero for CODEQLICK once the cleanup is done.
 */
export async function adultRowsOfRealm(
  prisma: PrismaClient,
  realm: 'CODEQLICK' | 'NEOQLICK',
  emailLike?: string,
): Promise<number> {
  const refs = await prisma.$queryRaw<{ tbl: string; col: string }[]>`
    SELECT t.relname AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass
      AND t.relname ~ ${ADULT_TABLE_PATTERN}`;
  let total = 0;
  for (const { tbl, col } of refs) {
    // Names come from the catalog and match the pattern or are column names: safe as identifiers.
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${tbl}" x JOIN users u ON u.id = x."${col}"
       WHERE u.realm = $1::"Realm" AND ($2::text IS NULL OR u.email LIKE $2)`,
      realm,
      emailLike ?? null,
    );
    total += Number(rows[0]?.count ?? 0);
  }
  return total;
}

/** The accounts that exist only to use the 18+ apps (nothing else hangs from them). */
function appAccountsWhere(): Prisma.UserWhereInput {
  return {
    realm: 'CODEQLICK',
    role: 'CLIENT',
    signupApp: { in: [...NEOQLICK_APPS] },
    // Not a client (no company, project, proposal, ticket or lead) and no other Codeqlick app.
    AND: [
      { NOT: CLIENT_WHERE },
      { NOT: appWhere('cloud') },
      { NOT: appWhere('citas') },
      { NOT: appWhere('meetings') },
    ],
  };
}

/**
 * Counts and, with `options.apply`, deletes the 18+ data of CODEQLICK accounts: every row of the
 * 18+ tables and of their activity log, in one transaction; the files of `dirs` after it commits.
 */
export async function neoqlickCleanup(
  prisma: PrismaClient,
  dirs: readonly string[],
  options: CleanupOptions,
): Promise<CleanupReport> {
  const names = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name ~ ${ADULT_TABLE_PATTERN}
    ORDER BY table_name`;
  const tables: Record<string, number> = {};
  for (const { table_name: name } of names) {
    // The name comes from the catalog and matches the pattern: safe to quote as an identifier.
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${name}"`,
    );
    tables[name] = Number(rows[0]?.count ?? 0);
  }
  const activityWhere: Prisma.ActivityLogWhereInput = {
    targetType: { in: [...ADULT_ACTIVITY_TARGETS] },
  };
  const activityLogs = await prisma.activityLog.count({ where: activityWhere });
  const appAccounts = await prisma.user.findMany({
    where: appAccountsWhere(),
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  let files = 0;
  for (const dir of dirs) files += await countFiles(dir);

  const report: CleanupReport = {
    applied: options.apply,
    tables,
    rows: Object.values(tables).reduce((sum, count) => sum + count, 0),
    neoqlickRows: await adultRowsOfRealm(prisma, 'NEOQLICK'),
    activityLogs,
    files,
    appAccounts,
    appAccountsDeleted: 0,
    signupAppsCleared: 0,
  };
  if (!options.apply) return report;
  if (report.neoqlickRows > 0 && !options.force) {
    throw new Error(
      `${report.neoqlickRows} rows of the 18+ tables belong to NEOQLICK accounts: the apps are in use and this would delete their data. Nothing was changed; pass --force to delete anyway.`,
    );
  }

  const deleted = options.deleteAppAccounts ? appAccounts.map((account) => account.id) : [];
  await prisma.$transaction(
    async (tx) => {
      if (names.length > 0) {
        // One statement for all of them: it fails (and nothing changes) if any other table still
        // references one, instead of cascading into data that isn't the apps'.
        const list = names.map(({ table_name }) => `"${table_name}"`).join(', ');
        await tx.$executeRawUnsafe(`TRUNCATE ${list}`);
      }
      await tx.activityLog.deleteMany({ where: activityWhere });
      if (deleted.length > 0) {
        // Their sessions, tokens and the like go with them (cascade).
        await tx.user.deleteMany({ where: { id: { in: deleted }, ...appAccountsWhere() } });
      }
      const cleared = await tx.user.updateMany({
        where: { realm: 'CODEQLICK', signupApp: { in: [...NEOQLICK_APPS] } },
        data: { signupApp: null },
      });
      report.signupAppsCleared = cleared.count;
    },
    { timeout: 120_000 },
  );
  report.appAccountsDeleted = deleted.length;

  // Files go after the commit: a failed deletion never leaves rows pointing at nothing.
  for (const dir of dirs) await emptyDir(dir);
  // Their profile photos are left to the avatar cleanup, which removes files nothing references.
  return report;
}

function parseArgs(argv: readonly string[]): CleanupOptions {
  const known = new Set(['--apply', '--dry-run', '--delete-app-accounts', '--force']);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0 || (argv.includes('--apply') && argv.includes('--dry-run'))) {
    process.stderr.write(
      `usage: neoqlick-cleanup.js [--dry-run | --apply] [--delete-app-accounts] [--force]${
        unknown.length > 0 ? `\nunknown: ${unknown.join(' ')}` : ''
      }\n`,
    );
    process.exit(2);
  }
  return {
    apply: argv.includes('--apply'),
    deleteAppAccounts: argv.includes('--delete-app-accounts'),
    force: argv.includes('--force'),
  };
}

function print(report: CleanupReport): void {
  const out = (line: string) => process.stdout.write(`${line}\n`);
  out(report.applied ? 'APPLIED' : 'DRY RUN (nothing was changed; use --apply to delete)');
  for (const [table, count] of Object.entries(report.tables)) {
    if (count > 0) out(`  ${table}: ${count}`);
  }
  out(`18+ rows: ${report.rows}`);
  if (report.neoqlickRows > 0) {
    out(
      `  of which ${report.neoqlickRows} belong to NEOQLICK accounts (--apply refuses without --force)`,
    );
  }
  out(`activity log rows (adult, cruising, swipe, videochat): ${report.activityLogs}`);
  out(`uploaded files: ${report.files}`);
  out(`accounts that exist only to use the apps: ${report.appAccounts.length}`);
  for (const account of report.appAccounts) out(`  ${account.id} ${account.email}`);
  if (report.applied) {
    out(`accounts deleted: ${report.appAccountsDeleted}`);
    out(`signup app cleared on the accounts that stay: ${report.signupAppsCleared}`);
  } else if (report.appAccounts.length > 0) {
    out('  (they stay unless you also pass --delete-app-accounts)');
  }
}

// Runs only when started as a command, not when the test imports it.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const options = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const dirs = [
      process.env.CRUISING_UPLOADS_DIR ?? './cruising-uploads',
      process.env.SWIPE_UPLOADS_DIR ?? './swipe-uploads',
    ];
    print(await neoqlickCleanup(prisma, dirs, options));
  } finally {
    await prisma.$disconnect();
  }
}
