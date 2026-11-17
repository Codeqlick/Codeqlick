import type { AdultApp, Prisma } from '../../generated/prisma/client.js';

/** A Prisma client inside the shared safety's transaction. */
export type Db = Prisma.TransactionClient;

/** What a shared suspension writes into an app's profile (null clears it). */
export interface ProfileSuspension {
  at: Date;
  until: Date | null;
  reason: string;
  category: string;
  /** Videochat keeps it in the person's history with the report it acted on. */
  byId: string | null;
  reportId: string | null;
}

/** A person's entry in an app. */
export interface AppEntry {
  termsVersion: string;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
  /** Their name there (Cruising's nickname; the username in Swipe and the video chat). */
  name: string | null;
}

/** One app's view of a person, for the team's "Across the 18+ apps" panel. */
export interface AppPersonOverview {
  enteredAt: Date | null;
  name: string | null;
  reportsReceived: Array<{ status: string; reason: string; count: number }>;
  reportsMade: number;
  suspension: {
    since: Date;
    until: Date | null;
    reason: string | null;
    category: string | null;
  } | null;
}

/**
 * What the shared safety (architecture 4.16) needs from each app, implemented by the app's own
 * repository: the adult module reads and writes the apps' tables only through them. The methods
 * taking `db` run inside one transaction the adult module opens.
 */
export interface AdultAppStore {
  readonly app: AdultApp;
  /** Writes the block row (sourceApp only on a new row) and runs the app's block side effects. */
  applyBlock(db: Db, blockerId: string, blockedId: string, sourceApp: AdultApp): Promise<void>;
  /** Deletes what a block ends between two people (both ways). */
  clearBetween(db: Db, a: string, b: string): Promise<void>;
  /** Lifts `blockerId`'s block of `blockedId`; true when there was one. */
  removeBlock(db: Db, blockerId: string, blockedId: string): Promise<boolean>;
  /** The profile's suspension fields; null when the person never entered the app. */
  suspensionState(
    db: Db,
    userId: string,
  ): Promise<{ suspendedAt: Date | null; suspendedUntil: Date | null } | null>;
  setSuspension(db: Db, userId: string, suspension: ProfileSuspension): Promise<void>;
  /** Clears the suspension written at `at` (a shared one); a later per-app one stays. */
  clearSuspensionAt(
    db: Db,
    userId: string,
    at: Date,
    byId: string | null,
    reason: string,
  ): Promise<void>;
  /** The person's entry in the app (terms accepted, suspension, name); null: never entered. */
  entryOf(userId: string): Promise<AppEntry | null>;
  /** The person's name in the app, by account; absent: no name there. */
  namesOf(userIds: string[]): Promise<Map<string, string>>;
  /** The person in this app: entry, name, reports and suspension. */
  overviewOf(userId: string): Promise<AppPersonOverview>;
  /** Open and total reports received per person, among `userIds`. */
  reportCountsOf(userIds: string[]): Promise<Map<string, { open: number; total: number }>>;
  /** The blocks `userId` made in this table (shared blocks are in the three). */
  blocksMadeBy(
    userId: string,
  ): Promise<Array<{ blockedId: string; sourceApp: AdultApp | null; createdAt: Date }>>;
  /** The people who blocked `userId` in this table. */
  blockersOf(userId: string): Promise<string[]>;
  /** When the newest thing waiting for the team arrived (verification photos left out). */
  newestPendingAt(): Promise<Date | null>;
  /** What waits for the team in this app, for the one digest: [label, count] rows. */
  digestCounts(): Promise<Array<[label: string, count: number]>>;
}
