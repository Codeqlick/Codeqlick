import { WEBAPPS, type Webapp } from '../../common/webapps.js';
import type { Prisma, User } from '../../generated/prisma/client.js';

/**
 * Who an account is for the team (decision 29): a Codeqlick client (someone we build for), a
 * user of our own web apps, or neither yet. Admins are their own kind. Derived from what hangs from
 * the account, so it follows the data: an app user who gets a proposal becomes a client.
 */
export const ACCOUNT_KINDS = ['client', 'app', 'none'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** A client account: part of a client company, prepared by the team, or with client work. */
export const CLIENT_WHERE: Prisma.UserWhereInput = {
  role: 'CLIENT',
  OR: [
    { registeredAt: null },
    { memberOfId: { not: null } },
    { members: { some: {} } },
    { clientProjects: { some: {} } },
    { proposals: { some: {} } },
    { tickets: { some: {} } },
    { leadsConverted: { some: {} } },
  ],
};

/** Signed up from the app, or uses it. */
export function appWhere(app: Webapp): Prisma.UserWhereInput {
  const uses: Record<Webapp, Prisma.UserWhereInput> = {
    videochat: { videochatProfile: { isNot: null } },
    swipe: { swipeProfile: { isNot: null } },
    meetings: { meetingRooms: { some: {} } },
    citas: { bookingPages: { some: {} } },
    cloud: { cloudMemberships: { some: {} } },
  };
  return { role: 'CLIENT', OR: [{ signupApp: app }, uses[app]] };
}

const ANY_APP_WHERE: Prisma.UserWhereInput = { OR: WEBAPPS.map(appWhere) };

// Said without NOT: `NOT (signup_app = 'x')` is NULL, not true, for accounts without one.
const NO_APP_WHERE: Prisma.UserWhereInput = {
  signupApp: null,
  videochatProfile: { is: null },
  swipeProfile: { is: null },
  meetingRooms: { none: {} },
  bookingPages: { none: {} },
  cloudMemberships: { none: {} },
};

/** The accounts of a kind: an app user is one who isn't a client. */
export function kindWhere(kind: AccountKind): Prisma.UserWhereInput {
  if (kind === 'client') return CLIENT_WHERE;
  if (kind === 'app') return { AND: [ANY_APP_WHERE, { NOT: CLIENT_WHERE }] };
  return { role: 'CLIENT', AND: [{ NOT: CLIENT_WHERE }, NO_APP_WHERE] };
}

/** What the kind and the apps of an account are worked out from. */
export const USAGE_INCLUDE = {
  videochatProfile: { select: { userId: true } },
  swipeProfile: { select: { userId: true } },
  _count: {
    select: {
      members: true,
      clientProjects: true,
      proposals: true,
      tickets: true,
      leadsConverted: true,
      meetingRooms: true,
      bookingPages: true,
      cloudMemberships: true,
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithUsage = Prisma.UserGetPayload<{ include: typeof USAGE_INCLUDE }>;

/** The apps the account signed up from or uses, in the order of WEBAPPS. */
export function appsOf(user: UserWithUsage): Webapp[] {
  const uses: Record<Webapp, boolean> = {
    videochat: user.videochatProfile !== null,
    swipe: user.swipeProfile !== null,
    meetings: user._count.meetingRooms > 0,
    citas: user._count.bookingPages > 0,
    cloud: user._count.cloudMemberships > 0,
  };
  return WEBAPPS.filter((app) => uses[app] || user.signupApp === app);
}

export function isClientAccount(user: UserWithUsage): boolean {
  const count = user._count;
  return (
    user.role === 'CLIENT' &&
    (user.registeredAt === null ||
      user.memberOfId !== null ||
      count.members > 0 ||
      count.clientProjects > 0 ||
      count.proposals > 0 ||
      count.tickets > 0 ||
      count.leadsConverted > 0)
  );
}

/** Null for admins. */
export function kindOf(user: UserWithUsage): AccountKind | null {
  if (user.role !== 'CLIENT') return null;
  if (isClientAccount(user)) return 'client';
  return appsOf(user).length > 0 ? 'app' : 'none';
}

/** The web app it signed up from, when it is one we still know. */
export function signupAppOf(user: Pick<User, 'signupApp'>): Webapp | null {
  return (WEBAPPS as readonly string[]).includes(user.signupApp ?? '')
    ? (user.signupApp as Webapp)
    : null;
}
